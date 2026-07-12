import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { StateStore, WeixinSession } from "./state.js";

export type PortableOpenClawState = {
  schemaVersion: 1;
  exportedAt: string;
  source: "openclaw-weixin";
  account: {
    accountId: string;
    token: string;
    baseUrl: string;
    userId?: string;
    savedAt?: string;
  };
  getUpdatesBuf?: string;
  contextTokens?: Record<string, string>;
  routeTag?: string;
  botAgent?: string;
};

export type ImportSummary = {
  accountId: string;
  userId?: string;
  tokenPresent: true;
  syncCursorImported: boolean;
  contextTokensImported: number;
  routeTagImported: boolean;
  sourceFile: string;
};

export function exportOpenClawState(params: {
  stateDir?: string;
  outputPath: string;
  accountId?: string;
}): PortableOpenClawState {
  const stateDir = path.resolve(
    params.stateDir ||
      process.env.OPENCLAW_STATE_DIR ||
      path.join(os.homedir(), ".openclaw"),
  );
  const accountsDir = path.join(stateDir, "openclaw-weixin", "accounts");
  const accountId = params.accountId || selectAccountId(stateDir, accountsDir);
  const accountPath = path.join(accountsDir, `${accountId}.json`);
  const account = readObject(accountPath);
  const token = stringValue(account.token);
  if (!token) throw new Error(`OpenClaw 账号文件缺少 token：${accountPath}`);

  const sync = readObject(
    path.join(accountsDir, `${accountId}.sync.json`),
    true,
  );
  const contextTokens = readStringMap(
    path.join(accountsDir, `${accountId}.context-tokens.json`),
  );
  const openclawConfig = readObject(path.join(stateDir, "openclaw.json"), true);
  const channel = readChannelConfig(openclawConfig, accountId);
  const bundle: PortableOpenClawState = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    source: "openclaw-weixin",
    account: {
      accountId,
      token,
      baseUrl:
        stringValue(account.baseUrl) ||
        stringValue(channel.account.baseUrl) ||
        stringValue(channel.section.baseUrl) ||
        "https://ilinkai.weixin.qq.com",
      ...(stringValue(account.userId)
        ? { userId: stringValue(account.userId) }
        : {}),
      ...(stringValue(account.savedAt)
        ? { savedAt: stringValue(account.savedAt) }
        : {}),
    },
    ...(stringValue(sync.get_updates_buf)
      ? { getUpdatesBuf: stringValue(sync.get_updates_buf) }
      : {}),
    ...(Object.keys(contextTokens).length ? { contextTokens } : {}),
    ...(stringValue(channel.account.routeTag) ||
    stringValue(channel.section.routeTag)
      ? {
          routeTag:
            stringValue(channel.account.routeTag) ||
            stringValue(channel.section.routeTag),
        }
      : {}),
    ...(stringValue(channel.account.botAgent) ||
    stringValue(channel.section.botAgent)
      ? {
          botAgent:
            stringValue(channel.account.botAgent) ||
            stringValue(channel.section.botAgent),
        }
      : {}),
  };

  const outputPath = path.resolve(params.outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(outputPath, 0o600);
  } catch {
    // Best effort.
  }
  return bundle;
}

export function importOpenClawState(params: {
  inputPath: string;
  store: StateStore;
}): ImportSummary {
  const inputPath = path.resolve(params.inputPath);
  const bundle = JSON.parse(
    fs.readFileSync(inputPath, "utf8"),
  ) as PortableOpenClawState;
  validateBundle(bundle);

  const session: WeixinSession = {
    accountId: normalizeAccountId(bundle.account.accountId),
    token: bundle.account.token,
    baseUrl: normalizeBaseUrl(bundle.account.baseUrl),
    ...(bundle.account.userId ? { userId: bundle.account.userId } : {}),
    savedAt: bundle.account.savedAt || new Date().toISOString(),
  };
  params.store.saveSession(session);
  if (bundle.getUpdatesBuf !== undefined) {
    params.store.saveSyncCursor(bundle.getUpdatesBuf);
  }
  const contextTokensImported = params.store.importContextTokens(
    bundle.contextTokens ?? {},
  );
  const config = params.store.loadConfig();
  if (bundle.routeTag) config.weixin.routeTag = bundle.routeTag;
  if (bundle.botAgent) config.weixin.botAgent = bundle.botAgent;
  if (
    session.userId &&
    !config.security.allowedUserIds.includes(session.userId)
  ) {
    config.security.allowedUserIds.push(session.userId);
  }
  params.store.saveConfig(config);

  return {
    accountId: session.accountId,
    ...(session.userId ? { userId: session.userId } : {}),
    tokenPresent: true,
    syncCursorImported: bundle.getUpdatesBuf !== undefined,
    contextTokensImported,
    routeTagImported: Boolean(bundle.routeTag),
    sourceFile: inputPath,
  };
}

function selectAccountId(stateDir: string, accountsDir: string): string {
  const indexPath = path.join(stateDir, "openclaw-weixin", "accounts.json");
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    if (Array.isArray(index)) {
      const ids = index.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      );
      if (ids.length) return ids[ids.length - 1];
    }
  } catch {
    // Fall back to account files.
  }
  let candidates: string[] = [];
  try {
    candidates = fs
      .readdirSync(accountsDir)
      .filter(
        (name) =>
          name.endsWith(".json") &&
          !name.endsWith(".sync.json") &&
          !name.endsWith(".context-tokens.json"),
      )
      .sort(
        (a, b) =>
          fs.statSync(path.join(accountsDir, a)).mtimeMs -
          fs.statSync(path.join(accountsDir, b)).mtimeMs,
      );
  } catch {
    // Handled below.
  }
  if (!candidates.length) {
    throw new Error(`未找到 OpenClaw 微信账号状态：${accountsDir}`);
  }
  return candidates[candidates.length - 1].replace(/\.json$/, "");
}

function readChannelConfig(
  config: Record<string, unknown>,
  accountId: string,
): { section: Record<string, unknown>; account: Record<string, unknown> } {
  const channels = objectValue(config.channels);
  const section = objectValue(channels["openclaw-weixin"]);
  const accounts = objectValue(section.accounts);
  return { section, account: objectValue(accounts[accountId]) };
}

function readObject(
  filePath: string,
  optional = false,
): Record<string, unknown> {
  try {
    return objectValue(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch (error) {
    if (optional) return {};
    throw new Error(`无法读取 ${filePath}: ${String(error)}`);
  }
}

function readStringMap(filePath: string): Record<string, string> {
  const value = readObject(filePath, true);
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].length > 0,
    ),
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateBundle(bundle: PortableOpenClawState): void {
  if (bundle.schemaVersion !== 1 || bundle.source !== "openclaw-weixin") {
    throw new Error("不支持的 OpenClaw 微信状态包格式");
  }
  if (
    !bundle.account?.accountId ||
    !bundle.account?.token ||
    !bundle.account?.baseUrl
  ) {
    throw new Error("状态包缺少 accountId、token 或 baseUrl");
  }
}

function normalizeAccountId(value: string): string {
  return value
    .trim()
    .replaceAll("@", "-")
    .replaceAll(".", "-")
    .replace(/[^A-Za-z0-9_-]/g, "-");
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
