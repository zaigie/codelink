import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { StateStore } from "./state.js";

const CODELINK_MCP_URL = "http://127.0.0.1:18791/mcp";
const CODELINK_MCP_TOOLS = [
  "get_wechat_status",
  "list_recent_wechat_tasks",
  "send_wechat_message",
];

export type DoctorReport = {
  ok: boolean;
  runtimeReady: boolean;
  pluginInstalled: boolean;
  mcpBundleReady: boolean;
  mcpEndpointReady: boolean;
  daemonHealthy: boolean;
  wechatLoggedIn: boolean;
  defaultRecipientReady: boolean;
  currentConversationBound: boolean;
  newTaskRequired: true;
};

export function createDoctorReport(params: {
  store: StateStore;
  daemonStatus: unknown;
  mcpEndpointReady: boolean;
}): DoctorReport {
  const status = asRecord(params.daemonStatus);
  const receipt = params.store.loadInstallReceipt();
  const runtimeReady = validateRuntime(params.store.path("runtime"));
  const plugin = validatePlugin(receipt);
  const pluginInstalled = plugin.installed;
  const mcpBundleReady = plugin.mcpReady;
  const mcpEndpointReady = params.mcpEndpointReady;
  const daemonHealthy = status?.ok === true;
  const wechatLoggedIn = Boolean(params.store.loadSession()) &&
    status?.sessionExpired !== true;
  const defaultRecipientReady = status?.hasDefaultContextToken === true;
  const currentConversationBound =
    typeof status?.activeThreadId === "string" && status.activeThreadId.length > 0;

  return {
    ok:
      runtimeReady &&
      pluginInstalled &&
      mcpBundleReady &&
      mcpEndpointReady &&
      daemonHealthy &&
      wechatLoggedIn,
    runtimeReady,
    pluginInstalled,
    mcpBundleReady,
    mcpEndpointReady,
    daemonHealthy,
    wechatLoggedIn,
    defaultRecipientReady,
    currentConversationBound,
    newTaskRequired: true,
  };
}

export async function probeMcpEndpoint(
  endpoint = CODELINK_MCP_URL,
): Promise<boolean> {
  const client = new Client({ name: "codelink-doctor", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { signal: AbortSignal.timeout(3_000) },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((tool) => tool.name));
    return CODELINK_MCP_TOOLS.every((name) => names.has(name));
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

function validateRuntime(runtimeDir: string): boolean {
  try {
    const manifest = asRecord(
      JSON.parse(
        fs.readFileSync(path.join(runtimeDir, "runtime-manifest.json"), "utf8"),
      ),
    );
    const files = asRecord(manifest?.files);
    if (manifest?.schemaVersion !== 1 || !files) return false;
    for (const name of ["cli.cjs", "mcp.js"]) {
      const expected = files[name];
      if (typeof expected !== "string") return false;
      const actual = createHash("sha256")
        .update(fs.readFileSync(path.join(runtimeDir, name)))
        .digest("hex");
      if (actual !== expected) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function validatePlugin(receipt: ReturnType<StateStore["loadInstallReceipt"]>): {
  installed: boolean;
  mcpReady: boolean;
} {
  if (
    receipt?.schemaVersion !== 1 ||
    receipt.pluginInstalled !== true ||
    receipt.mcpBundleReady !== true ||
    typeof receipt.pluginRoot !== "string" ||
    typeof receipt.pluginVersion !== "string" ||
    typeof receipt.mcpSha256 !== "string"
  ) {
    return { installed: false, mcpReady: false };
  }
  try {
    const manifest = asRecord(
      JSON.parse(
        fs.readFileSync(
          path.join(receipt.pluginRoot, ".codex-plugin", "plugin.json"),
          "utf8",
        ),
      ),
    );
    const installed =
      manifest?.name === "codelink" && manifest.version === receipt.pluginVersion;
    if (!installed) return { installed: false, mcpReady: false };
    const mcp = asRecord(
      JSON.parse(
        fs.readFileSync(path.join(receipt.pluginRoot, ".mcp.json"), "utf8"),
      ),
    );
    const servers = asRecord(mcp?.mcpServers);
    const codelink = asRecord(servers?.codelink);
    const mcpPath = path.join(receipt.pluginRoot, "dist", "mcp.js");
    const mcpHash = createHash("sha256")
      .update(fs.readFileSync(mcpPath))
      .digest("hex");
    const mcpReady =
      codelink?.url === CODELINK_MCP_URL &&
      mcpHash === receipt.mcpSha256;
    return { installed: true, mcpReady };
  } catch {
    return { installed: false, mcpReady: false };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}
