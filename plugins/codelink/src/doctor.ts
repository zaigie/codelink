import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { StateStore } from "./state.js";

export type DoctorReport = {
  ok: boolean;
  runtimeReady: boolean;
  pluginInstalled: boolean;
  mcpBundleReady: boolean;
  daemonHealthy: boolean;
  wechatLoggedIn: boolean;
  defaultRecipientReady: boolean;
  currentConversationBound: boolean;
  newTaskRequired: true;
};

export function createDoctorReport(params: {
  store: StateStore;
  daemonStatus: unknown;
}): DoctorReport {
  const status = asRecord(params.daemonStatus);
  const receipt = params.store.loadInstallReceipt();
  const runtimeReady = validateRuntime(params.store.path("runtime"));
  const plugin = validatePlugin(receipt);
  const pluginInstalled = plugin.installed;
  const mcpBundleReady = plugin.mcpReady;
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
      daemonHealthy &&
      wechatLoggedIn,
    runtimeReady,
    pluginInstalled,
    mcpBundleReady,
    daemonHealthy,
    wechatLoggedIn,
    defaultRecipientReady,
    currentConversationBound,
    newTaskRequired: true,
  };
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
    const args = Array.isArray(codelink?.args) ? codelink.args : [];
    const mcpPath = path.join(receipt.pluginRoot, "dist", "mcp.js");
    const mcpHash = createHash("sha256")
      .update(fs.readFileSync(mcpPath))
      .digest("hex");
    const mcpReady =
      codelink?.command === "node" &&
      args.includes("./dist/mcp.js") &&
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
