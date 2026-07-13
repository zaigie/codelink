import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it, vi } from "vitest";

import { defaultConfig } from "../src/config.js";
import { CodelinkDaemon } from "../src/daemon.js";
import { probeMcpEndpoint } from "../src/doctor.js";
import { createMcpHttpHandler } from "../src/mcp-http.js";
import { StateStore } from "../src/state.js";
import type { WeixinClient } from "../src/weixin/client.js";

describe("CodeLink Streamable HTTP MCP", () => {
  it("通过 daemon HTTP 暴露工具并透传受信 Codex thread 元数据", async () => {
    const send = vi.fn(async () => ({
      ok: true,
      conversationBound: true,
    }));
    let handler: ReturnType<typeof createMcpHttpHandler>;
    const httpServer = http.createServer((request, response) => {
      void handler(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("测试 HTTP 服务没有 TCP 端口");
    }
    handler = createMcpHttpHandler({
      client: {
        status: vi.fn(async () => ({ ok: true })),
        recentTasks: vi.fn(async () => ({ tasks: [] })),
        send,
      },
      allowedHosts: [`127.0.0.1:${address.port}`],
    });
    const client = new Client({ name: "codelink-http-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}/mcp`),
    );

    try {
      await expect(
        probeMcpEndpoint(`http://127.0.0.1:${address.port}/mcp`),
      ).resolves.toBe(true);
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "get_wechat_status",
        "list_recent_wechat_tasks",
        "send_wechat_message",
      ]);

      await client.callTool({
        name: "send_wechat_message",
        arguments: { text: "task completed" },
        _meta: {
          threadId: "019f55b8-d06b-7213-98de-2815f865c43d",
        },
      });

      expect(send).toHaveBeenCalledWith({
        text: "task completed",
        threadId: "019f55b8-d06b-7213-98de-2815f865c43d",
      });
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("由常驻 daemon 在插件声明的 /mcp 路径提供工具", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-mcp-http-"));
    const store = new StateStore(dir);
    store.saveSession({
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    });
    const config = defaultConfig();
    config.daemon.port = await reservePort();
    let finishPolling!: () => void;
    const polling = new Promise<void>((resolve) => {
      finishPolling = resolve;
    });
    const getUpdates = vi.fn(async () => {
      await polling;
      return { ret: 0, get_updates_buf: "", msgs: [] };
    });
    const daemon = new CodelinkDaemon(
      config,
      store,
      { getUpdates } as unknown as WeixinClient,
      { runTask: vi.fn() },
    );
    const started = daemon.start();
    await vi.waitFor(() => expect(getUpdates).toHaveBeenCalledTimes(1));
    const client = new Client({ name: "daemon-http-test", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${config.daemon.port}/mcp`),
    );

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain(
        "send_wechat_message",
      );
    } finally {
      await client.close().catch(() => undefined);
      await daemon.stop();
      finishPolling();
      await started;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

async function reservePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("测试 HTTP 服务没有 TCP 端口");
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
