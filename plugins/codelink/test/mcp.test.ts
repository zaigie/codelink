import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createMcpServer } from "../src/mcp.js";

describe("CodeLink MCP", () => {
  it("forwards the trusted Codex thread metadata without exposing threadId as a tool argument", async () => {
    const send = vi.fn(async () => ({
      ok: true,
      conversationBound: true,
    }));
    const server = createMcpServer({ send } as never);
    const client = new Client({ name: "test-client", version: "0.1.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    try {
      const tools = await client.listTools();
      const notificationTool = tools.tools.find(
        (tool) => tool.name === "send_wechat_message",
      );
      expect(notificationTool?.inputSchema).not.toHaveProperty(
        "properties.threadId",
      );

      await client.callTool({
        name: "send_wechat_message",
        arguments: { text: "task completed" },
        _meta: {
          threadId: "019f55b8-d06b-7213-98de-2815f865c43d",
          "x-codex-turn-metadata": {
            thread_id: "019f55b8-d06b-7213-98de-2815f865c43d",
          },
        },
      });

      expect(send).toHaveBeenCalledWith({
        text: "task completed",
        threadId: "019f55b8-d06b-7213-98de-2815f865c43d",
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
