import fs from "node:fs";
import os from "node:os";
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

  it("starts when launched through a symlinked path", async () => {
    const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-mcp-link-"));
    const linkPath = path.join(linkDir, "mcp.js");
    try {
      fs.symlinkSync(path.join(pluginRoot, "dist", "mcp.js"), linkPath);
    } catch (error) {
      fs.rmSync(linkDir, { recursive: true, force: true });
      // Windows 无特权环境可能不允许创建符号链接；该场景以 POSIX 覆盖为准。
      if (process.platform === "win32") return;
      throw error;
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [linkPath],
      cwd: pluginRoot,
      stderr: "pipe",
    });
    const client = new Client({ name: "codelink-test", version: "0.1.0" });
    try {
      await client.connect(transport);
      const result = await client.listTools();
      expect(result.tools.length).toBeGreaterThan(0);
    } finally {
      await client.close();
      fs.rmSync(linkDir, { recursive: true, force: true });
    }
  });
});
