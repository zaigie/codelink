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

export type ConversationBinding = {
  threadId: string;
  updatedAt: string;
};

export type ConversationSnapshot = {
  binding: ConversationBinding | null;
  generation: number;
};

export type TaskRecord = {
  messageId: string;
  fromUserId: string;
  threadId?: string;
  workspace?: string;
  prompt?: string;
  promptPreview: string;
  startNew?: boolean;
  conversationAtReceipt?: ConversationBinding | null;
  conversationGenerationAtReceipt?: number;
  status: "accepted" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  finalResponsePreview?: string;
  error?: string;
  delivery?: {
    acknowledgement?: TaskDeliveryRecord;
    result?: TaskDeliveryRecord;
  };
};

export type TaskDeliveryRecord = {
  status: "pending" | "sent" | "failed" | "skipped";
  updatedAt: string;
  totalChunks?: number;
  sentChunks?: number;
  failedChunkIndex?: number;
  errorCode?: number;
  error?: string;
  text?: string;
  deliveryKey?: string;
};

type TaskState = {
  tasks: TaskRecord[];
};

type ConversationState = {
  conversations: Record<string, ConversationBinding>;
  generations: Record<string, number>;
};

type ProcessedMessageState = {
  messageIds: string[];
};

const MAX_PROCESSED_MESSAGE_IDS = 5_000;

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

  hasProcessedMessage(messageId: string): boolean {
    return this.loadProcessedMessageState().messageIds.includes(messageId);
  }

  markProcessedMessage(messageId: string): boolean {
    const state = this.loadProcessedMessageState();
    if (state.messageIds.includes(messageId)) return false;
    state.messageIds.push(messageId);
    state.messageIds = state.messageIds.slice(-MAX_PROCESSED_MESSAGE_IDS);
    this.writeJson("processed-messages.json", state, 0o600);
    return true;
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

  getConversation(userId: string): ConversationBinding | null {
    return this.loadConversationState().conversations[userId] ?? null;
  }

  getConversationSnapshot(userId: string): ConversationSnapshot {
    const state = this.loadConversationState();
    return {
      binding: state.conversations[userId] ?? null,
      generation: state.generations[userId] ?? 0,
    };
  }

  bindConversation(
    userId: string,
    binding: Pick<ConversationBinding, "threadId">,
  ): void {
    const state = this.loadConversationState();
    const current = state.conversations[userId] ?? null;
    state.conversations[userId] = {
      threadId: binding.threadId,
      updatedAt: nextConversationUpdatedAt(current),
    };
    state.generations[userId] = (state.generations[userId] ?? 0) + 1;
    this.writeJson("conversations.json", state, 0o600);
  }

  bindConversationIfUnchanged(
    userId: string,
    expected: ConversationBinding | null,
    threadId: string,
    expectedGeneration?: number,
  ): boolean {
    return this.replaceConversationIfUnchanged(
      userId,
      expected,
      { threadId },
      expectedGeneration,
    );
  }

  replaceConversationIfUnchanged(
    userId: string,
    expected: ConversationBinding | null,
    replacement: Pick<ConversationBinding, "threadId"> | null,
    expectedGeneration?: number,
  ): boolean {
    const state = this.loadConversationState();
    const current = state.conversations[userId] ?? null;
    if (
      expectedGeneration !== undefined &&
      (state.generations[userId] ?? 0) !== expectedGeneration
    )
      return false;
    if (!sameConversationBinding(current, expected)) return false;
    if (replacement) {
      state.conversations[userId] = {
        threadId: replacement.threadId,
        updatedAt: nextConversationUpdatedAt(current),
      };
    } else {
      delete state.conversations[userId];
    }
    state.generations[userId] = (state.generations[userId] ?? 0) + 1;
    this.writeJson("conversations.json", state, 0o600);
    return true;
  }

  replaceConversationSnapshotIfUnchanged(
    userId: string,
    expected: ConversationSnapshot,
    replacement: ConversationSnapshot,
  ): boolean {
    const state = this.loadConversationState();
    const current = state.conversations[userId] ?? null;
    const currentGeneration = state.generations[userId] ?? 0;
    if (
      currentGeneration !== expected.generation ||
      !sameConversationBinding(current, expected.binding)
    ) {
      return false;
    }
    if (replacement.binding) {
      state.conversations[userId] = { ...replacement.binding };
    } else {
      delete state.conversations[userId];
    }
    if (replacement.generation === 0) {
      delete state.generations[userId];
    } else {
      state.generations[userId] = replacement.generation;
    }
    this.writeJson("conversations.json", state, 0o600);
    return true;
  }

  clearConversation(userId: string): void {
    const state = this.loadConversationState();
    delete state.conversations[userId];
    state.generations[userId] = (state.generations[userId] ?? 0) + 1;
    this.writeJson("conversations.json", state, 0o600);
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

  acceptTask(record: TaskRecord): boolean {
    const state = this.loadTaskState();
    if (state.tasks.some((task) => task.messageId === record.messageId))
      return false;
    state.tasks.push(record);
    state.tasks = state.tasks.slice(-500);
    this.writeJson("tasks.json", state, 0o600);
    return true;
  }

  updateTask(
    messageId: string,
    update: (current: TaskRecord) => TaskRecord,
  ): TaskRecord | null {
    const state = this.loadTaskState();
    const index = state.tasks.findIndex(
      (task) => task.messageId === messageId,
    );
    if (index < 0) return null;
    const next = update(state.tasks[index]);
    state.tasks[index] = next;
    this.writeJson("tasks.json", state, 0o600);
    return next;
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

  private loadConversationState(): ConversationState {
    const data = this.readJson("conversations.json") as ConversationState | null;
    return {
      conversations:
        data?.conversations && typeof data.conversations === "object"
          ? data.conversations
          : {},
      generations:
        data?.generations && typeof data.generations === "object"
          ? data.generations
          : {},
    };
  }

  private loadProcessedMessageState(): ProcessedMessageState {
    const data = this.readJson(
      "processed-messages.json",
    ) as ProcessedMessageState | null;
    return {
      messageIds: Array.isArray(data?.messageIds)
        ? data.messageIds.filter(
            (messageId): messageId is string => typeof messageId === "string",
          )
        : [],
    };
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

function sameConversationBinding(
  left: ConversationBinding | null,
  right: ConversationBinding | null,
): boolean {
  if (!left || !right) return left === right;
  return left.threadId === right.threadId && left.updatedAt === right.updatedAt;
}

function nextConversationUpdatedAt(
  current: ConversationBinding | null,
): string {
  const previous = current ? Date.parse(current.updatedAt) : Number.NaN;
  const timestamp = Number.isFinite(previous)
    ? Math.max(Date.now(), previous + 1)
    : Date.now();
  return new Date(timestamp).toISOString();
}
