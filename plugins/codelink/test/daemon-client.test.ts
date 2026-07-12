import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DaemonClient } from "../src/daemon-client.js";
import { StateStore } from "../src/state.js";

const cleanup: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("DaemonClient", () => {
  it("returns degraded health details even when the daemon responds 503", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          degraded: true,
          sessionExpired: true,
          lastPollError: "微信登录已失效",
        }),
        { status: 503 },
      ),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:18791",
      fetchImpl: fetchMock,
      authToken: "test-auth-token",
    });

    await expect(client.status()).resolves.toMatchObject({
      ok: false,
      degraded: true,
      sessionExpired: true,
    });
  });

  it("sends an explicit notification payload to the local daemon", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, toUserId: "owner" }), {
          status: 200,
        }),
      );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:18791",
      fetchImpl: fetchMock,
      authToken: "test-auth-token",
    });

    const result = await client.send({
      text: "task completed",
      threadId: "019f55b8-d06b-7213-98de-2815f865c43d",
    });

    expect(result).toEqual({ ok: true, toUserId: "owner" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:18791/send");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer test-auth-token",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "task completed",
      threadId: "019f55b8-d06b-7213-98de-2815f865c43d",
    });
  });

  it("automatically reuses the installation credential from the state store", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-client-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = new DaemonClient({
      baseUrl: "http://127.0.0.1:18791",
      fetchImpl: fetchMock,
      store,
    });

    await client.status();

    const token = store.loadDaemonAuthToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      new Headers(fetchMock.mock.calls[0][1]?.headers).get("Authorization"),
    ).toBe(`Bearer ${token}`);
  });

  it.each([
    ["status", (client: DaemonClient) => client.status()],
    ["recent tasks", (client: DaemonClient) => client.recentTasks()],
  ])("times out %s reads after ten seconds", async (_name, request) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const client = new DaemonClient({
      fetchImpl: hangingFetch((value) => {
        signal = value;
      }),
      authToken: "test-auth-token",
    });
    const assertion = expect(request(client)).rejects.toThrow(
      "CodeLink daemon 请求超时",
    );

    await vi.advanceTimersByTimeAsync(9_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await assertion;
  });

  it("keeps sends alive past ten seconds and caps them at ten minutes", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const client = new DaemonClient({
      fetchImpl: hangingFetch((value) => {
        signal = value;
      }),
      authToken: "test-auth-token",
    });
    const assertion = expect(
      client.send({ text: "long delivery" }),
    ).rejects.toThrow("CodeLink daemon 请求超时");

    await vi.advanceTimersByTimeAsync(10_000);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(589_999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await assertion;
  });

  it("does not retain a request timeout when credential loading fails", async () => {
    vi.useFakeTimers();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-client-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    vi.spyOn(store, "getOrCreateDaemonAuthToken").mockImplementation(() => {
      throw new Error("credential unavailable");
    });
    const fetchMock = vi.fn<typeof fetch>();
    const client = new DaemonClient({ fetchImpl: fetchMock, store });

    await expect(client.send({ text: "never sent" })).rejects.toThrow(
      "credential unavailable",
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function hangingFetch(onSignal: (signal: AbortSignal) => void): typeof fetch {
  return vi.fn((_input, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error("missing abort signal");
    onSignal(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  });
}
