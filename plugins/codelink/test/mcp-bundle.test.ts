import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const pluginRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("bundled MCP server", () => {
  it("starts over stdio and advertises the CodeLink tools", async () => {
    await expectTools(path.join(pluginRoot, "dist", "mcp.js"), pluginRoot);
  });

  it("starts when the bundle path contains spaces", async () => {
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink mcp bundle "),
    );
    try {
      fs.writeFileSync(
        path.join(temporary, "package.json"),
        JSON.stringify({ type: "module" }),
      );
      const bundlePath = path.join(temporary, "mcp bundle.js");
      fs.copyFileSync(path.join(pluginRoot, "dist", "mcp.js"), bundlePath);
      await expectTools(bundlePath, temporary);
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("can be imported when argv does not name a file", () => {
    const bundleUrl = pathToFileURL(
      path.join(pluginRoot, "dist", "mcp.js"),
    ).href;
    const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
      input: `const module = await import(${JSON.stringify(bundleUrl)});\nif (typeof module.createMcpServer !== "function") process.exit(2);\n`,
      encoding: "utf8",
    });

    expect(child.status, child.stderr).toBe(0);
  });
});

async function expectTools(bundlePath: string, cwd: string): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundlePath],
    cwd,
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
}
