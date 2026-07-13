import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "../src/config.js";
import { CodelinkDaemon } from "../src/daemon.js";
import { StateStore, type WeixinSession } from "../src/state.js";
import type { WeixinClient } from "../src/weixin/client.js";
import type { GetUpdatesResponse } from "../src/weixin/types.js";

const cleanup: string[] = [];
const AUTH_TOKEN = "daemon-test-token";

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("daemon HTTP runtime boundary", () => {
  it.each(["0.0.0.0", "::", "localhost"])(
    "rejects non-literal-loopback listen host %s",
    async (host) => {
      let daemon!: CodelinkDaemon;
      const fixture = daemonFixture({
        host,
        getUpdates: async () => {
          await daemon.stop();
          return { ret: 0, msgs: [] };
        },
      });
      daemon = fixture.daemon;

      await expect(daemon.start()).rejects.toThrow(
        "CodeLink daemon host must be loopback",
      );
    },
  );

  it("authenticates every route and gates business traffic on real polling readiness", async () => {
    const getUpdates = vi
      .fn<() => Promise<GetUpdatesResponse>>()
      .mockResolvedValueOnce({
        ret: 0,
        get_updates_buf: "ready-cursor",
        msgs: [],
      })
      .mockResolvedValueOnce({ errcode: -14, errmsg: "expired" })
      .mockResolvedValueOnce({
        ret: 0,
        get_updates_buf: "recovered-cursor",
        msgs: [],
      });
    const sendText = vi.fn(async () => undefined);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const { daemon, session } = daemonFixture({ getUpdates, sendText });
    await listenForHttpTests(daemon);
    const baseUrl = listeningUrl(daemon);

    try {
      for (const request of routeRequests()) {
        const missing = await fetch(
          new URL(request.pathname, baseUrl),
          request.init,
        );
        expect(missing.status).toBe(401);
        expect(await missing.json()).toEqual({
          ok: false,
          error: "unauthorized",
        });
        expect(missing.headers.get("WWW-Authenticate")).toBe("Bearer");

        const wrongHeaders = new Headers(request.init.headers);
        wrongHeaders.set("Authorization", "Bearer wrong-token");
        const wrong = await fetch(new URL(request.pathname, baseUrl), {
          ...request.init,
          headers: wrongHeaders,
        });
        expect(wrong.status).toBe(401);
        expect(JSON.stringify(await wrong.json())).not.toContain(AUTH_TOKEN);
      }

      expect((await authenticatedFetch(baseUrl, "/health")).status).toBe(503);
      expect((await authenticatedFetch(baseUrl, "/tasks")).status).toBe(503);
      expect(
        (
          await authenticatedFetch(baseUrl, "/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "not ready" }),
          })
        ).status,
      ).toBe(503);

      await expect(daemon.pollOnce(session, "")).resolves.toBe("ready-cursor");
      expect((await authenticatedFetch(baseUrl, "/health")).status).toBe(200);
      expect((await authenticatedFetch(baseUrl, "/tasks")).status).toBe(200);
      expect(
        (
          await authenticatedFetch(baseUrl, "/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "ready" }),
          })
        ).status,
      ).toBe(200);

      await expect(
        daemon.pollOnce(session, "ready-cursor"),
      ).rejects.toThrow("重新运行 codelink login");
      expect((await authenticatedFetch(baseUrl, "/health")).status).toBe(503);
      expect((await authenticatedFetch(baseUrl, "/tasks")).status).toBe(503);
      expect(
        (
          await authenticatedFetch(baseUrl, "/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "expired" }),
          })
        ).status,
      ).toBe(503);

      await expect(
        daemon.pollOnce(session, "ready-cursor"),
      ).resolves.toBe("recovered-cursor");
      expect((await authenticatedFetch(baseUrl, "/health")).status).toBe(200);
      expect(stderr.mock.calls.flat().join("")).not.toContain(AUTH_TOKEN);
    } finally {
      await daemon.stop();
    }
  });

  it("serves the identifier-free /healthz probe without authentication", async () => {
    const getUpdates = vi
      .fn<() => Promise<GetUpdatesResponse>>()
      .mockResolvedValueOnce({
        ret: 0,
        get_updates_buf: "ready-cursor",
        msgs: [],
      });
    const { daemon, session } = daemonFixture({ getUpdates });
    await listenForHttpTests(daemon);
    const baseUrl = listeningUrl(daemon);

    try {
      const notReady = await fetch(new URL("/healthz", baseUrl));
      expect(notReady.status).toBe(503);
      expect(await notReady.json()).toEqual({
        service: "codelink",
        ok: false,
        degraded: expect.any(Boolean),
        sessionExpired: expect.any(Boolean),
      });

      await expect(daemon.pollOnce(session, "")).resolves.toBe("ready-cursor");
      const ready = await fetch(new URL("/healthz", baseUrl));
      expect(ready.status).toBe(200);
      const body = (await ready.json()) as Record<string, unknown>;
      expect(body).toEqual({
        service: "codelink",
        ok: true,
        degraded: false,
        sessionExpired: false,
      });
      expect(JSON.stringify(body)).not.toMatch(/owner|thread|token/i);
    } finally {
      await daemon.stop();
    }
  });
});

function daemonFixture(params: {
  host?: string;
  getUpdates?: () => Promise<GetUpdatesResponse>;
  sendText?: (input: { text: string }) => Promise<void>;
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-http-"));
  cleanup.push(dir);
  const store = new StateStore(dir);
  const session: WeixinSession = {
    accountId: "bot",
    token: "weixin-token",
    userId: "owner",
    baseUrl: "https://ilinkai.weixin.qq.com",
    savedAt: "now",
  };
  store.saveSession(session);
  store.saveContextToken("owner", "context-owner");
  const config = defaultConfig();
  config.daemon.host = params.host ?? "127.0.0.1";
  config.daemon.port = 0;
  config.security.allowedUserIds = ["owner"];
  const client = {
    getUpdates: params.getUpdates ?? (() => new Promise(() => undefined)),
    sendText: params.sendText ?? (async () => undefined),
  } as unknown as WeixinClient;
  return {
    session,
    daemon: new CodelinkDaemon(
      config,
      store,
      client,
      { runTask: vi.fn() },
      { authToken: AUTH_TOKEN },
    ),
  };
}

async function listenForHttpTests(daemon: CodelinkDaemon): Promise<void> {
  const server = (daemon as unknown as { server: http.Server }).server;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function listeningUrl(daemon: CodelinkDaemon): URL {
  const server = (daemon as unknown as { server: http.Server }).server;
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("daemon did not expose a TCP address");
  }
  return new URL(`http://127.0.0.1:${address.port}`);
}

function authenticatedFetch(
  baseUrl: URL,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${AUTH_TOKEN}`);
  return fetch(new URL(pathname, baseUrl), { ...init, headers });
}

function routeRequests(): Array<{ pathname: string; init: RequestInit }> {
  return [
    { pathname: "/health", init: { method: "GET" } },
    { pathname: "/tasks", init: { method: "GET" } },
    {
      pathname: "/send",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello" }),
      },
    },
    { pathname: "/missing", init: { method: "GET" } },
  ];
}
