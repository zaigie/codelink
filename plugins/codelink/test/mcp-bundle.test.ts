import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const pluginRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("bundled MCP server", () => {
  it("starts over stdio and advertises the CodeLink tools", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(pluginRoot, "dist", "mcp.js")],
      cwd: pluginRoot,
      stderr: "pipe",
    });
    const client = new Client({ name: "codelink-test", version: "0.1.0" });
    try {
      await client.connect(transport);
      const result = await client.listTools();
      expect(result.tools.map((tool) => tool.name).sort()).toEqual([
        "get_wechat_status",
        "list_recent_wechat_tasks",
        "send_wechat_message",
      ]);
    } finally {
      await client.close();
    }
  });
});
