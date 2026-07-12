import fs from "node:fs";
import path from "node:path";

import { CodelinkConfig, parseConfig, resolveStateDir } from "./config.js";

export type WeixinSession = {
  accountId: string;
  token: string;
  userId?: string;
  baseUrl: string;
  savedAt: string;
};

export type ContextTokenRecord = {
  contextToken: string;
  updatedAt: string;
};

export type TaskRecord = {
  messageId: string;
  fromUserId: string;
  threadId?: string;
  workspace: string;
  promptPreview: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  finalResponsePreview?: string;
  error?: string;
};

type TaskState = {
  tasks: TaskRecord[];
};

export class StateStore {
  readonly dir: string;

  constructor(dir = resolveStateDir()) {
    this.dir = dir;
  }

  ensure(): void {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(this.dir, 0o700);
    } catch {
      // Best effort on filesystems that do not support POSIX permissions.
    }
  }

  path(name: string): string {
    return path.join(this.dir, name);
  }

  loadConfig(): CodelinkConfig {
    return parseConfig(this.readJson("config.json"));
  }

  saveConfig(config: CodelinkConfig): void {
    this.writeJson("config.json", config, 0o600);
  }

  loadSession(): WeixinSession | null {
    return this.readJson("weixin-session.json") as WeixinSession | null;
  }

  saveSession(session: WeixinSession): void {
    this.writeJson("weixin-session.json", session, 0o600);
  }

  loadSyncCursor(): string {
    const data = this.readJson("get-updates.json") as {
      get_updates_buf?: unknown;
    } | null;
    return typeof data?.get_updates_buf === "string"
      ? data.get_updates_buf
      : "";
  }

  saveSyncCursor(cursor: string): void {
    this.writeJson("get-updates.json", { get_updates_buf: cursor }, 0o600);
  }

  loadContextTokens(): Record<string, ContextTokenRecord> {
    const data = this.readJson("context-tokens.json");
    return data && typeof data === "object"
      ? (data as Record<string, ContextTokenRecord>)
      : {};
  }

  saveContextToken(userId: string, contextToken: string): void {
    const tokens = this.loadContextTokens();
    tokens[userId] = { contextToken, updatedAt: new Date().toISOString() };
    this.writeJson("context-tokens.json", tokens, 0o600);
  }

  importContextTokens(tokens: Record<string, string>): number {
    const existing = this.loadContextTokens();
    let count = 0;
    for (const [userId, contextToken] of Object.entries(tokens)) {
      if (!userId.trim() || !contextToken.trim()) continue;
      existing[userId] = {
        contextToken,
        updatedAt: new Date().toISOString(),
      };
      count += 1;
    }
    this.writeJson("context-tokens.json", existing, 0o600);
    return count;
  }

  getContextToken(userId: string): ContextTokenRecord | null {
    return this.loadContextTokens()[userId] ?? null;
  }

  listTasks(limit = 20): TaskRecord[] {
    const state = this.loadTaskState();
    return state.tasks.slice(-Math.max(1, limit)).reverse();
  }

  findTask(messageId: string): TaskRecord | null {
    return (
      this.loadTaskState().tasks.find((task) => task.messageId === messageId) ??
      null
    );
  }

  upsertTask(record: TaskRecord): void {
    const state = this.loadTaskState();
    const index = state.tasks.findIndex(
      (task) => task.messageId === record.messageId,
    );
    if (index >= 0) state.tasks[index] = record;
    else state.tasks.push(record);
    state.tasks = state.tasks.slice(-500);
    this.writeJson("tasks.json", state, 0o600);
  }

  private loadTaskState(): TaskState {
    const data = this.readJson("tasks.json") as TaskState | null;
    return { tasks: Array.isArray(data?.tasks) ? data.tasks : [] };
  }

  private readJson(name: string): unknown | null {
    this.ensure();
    try {
      return JSON.parse(fs.readFileSync(this.path(name), "utf8"));
    } catch {
      return null;
    }
  }

  private writeJson(name: string, value: unknown, mode: number): void {
    this.ensure();
    const destination = this.path(name);
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode,
    });
    fs.renameSync(temporary, destination);
    try {
      fs.chmodSync(destination, mode);
    } catch {
      // Best effort on filesystems that do not support POSIX permissions.
    }
  }
}
