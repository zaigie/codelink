import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { StateStore } from "../src/state.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("StateStore", () => {
  it("persists the WeChat session and context token in private files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-state-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.saveSession({
      accountId: "bot-im-bot",
      token: "secret-token",
      userId: "owner@im.wechat",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "2026-07-12T00:00:00.000Z",
    });
    store.saveContextToken("owner@im.wechat", "context-1");

    expect(store.loadSession()?.token).toBe("secret-token");
    expect(store.getContextToken("owner@im.wechat")?.contextToken).toBe(
      "context-1",
    );
    expect(fs.statSync(store.path("weixin-session.json")).mode & 0o777).toBe(
      0o600,
    );
    expect(fs.statSync(store.path("context-tokens.json")).mode & 0o777).toBe(
      0o600,
    );
  });

  it("deduplicates tasks by message id", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-state-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const task = {
      messageId: "42",
      fromUserId: "owner",
      workspace: "/tmp/task",
      promptPreview: "test",
      status: "running" as const,
      startedAt: "2026-07-12T00:00:00.000Z",
    };
    store.upsertTask(task);
    store.upsertTask({
      ...task,
      status: "completed",
      completedAt: "2026-07-12T00:01:00.000Z",
    });

    expect(store.listTasks()).toHaveLength(1);
    expect(store.findTask("42")?.status).toBe("completed");
  });

  it("persists acceptance before execution and merges delivery updates", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-state-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const accepted = {
      messageId: "accepted-1",
      fromUserId: "owner",
      promptPreview: "do the work",
      status: "accepted" as const,
      startedAt: "2026-07-12T00:00:00.000Z",
      delivery: {
        acknowledgement: {
          status: "pending" as const,
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
      },
    };

    expect(store.acceptTask(accepted)).toBe(true);
    expect(store.acceptTask(accepted)).toBe(false);
    store.updateTask("accepted-1", (current) => ({
      ...current,
      status: "running",
      delivery: {
        ...current.delivery,
        acknowledgement: {
          status: "failed",
          updatedAt: "2026-07-12T00:00:01.000Z",
          error: "network unavailable",
        },
      },
    }));

    expect(store.findTask("accepted-1")).toMatchObject({
      status: "running",
      delivery: {
        acknowledgement: {
          status: "failed",
          error: "network unavailable",
        },
      },
    });
  });

  it("persists a bounded private replay ledger", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-state-"));
    cleanup.push(dir);
    const store = new StateStore(dir);

    expect(store.markProcessedMessage("message-1")).toBe(true);
    expect(store.markProcessedMessage("message-1")).toBe(false);

    const reloaded = new StateStore(dir);
    expect(reloaded.hasProcessedMessage("message-1")).toBe(true);
    expect(
      fs.statSync(store.path("processed-messages.json")).mode & 0o777,
    ).toBe(0o600);
  });

  it("persists, replaces, and clears the active Codex conversation per WeChat user", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-state-"));
    cleanup.push(dir);
    const store = new StateStore(dir);

    store.bindConversation("owner", {
      threadId: "thread-from-wechat",
    });
    store.bindConversation("teammate", { threadId: "thread-teammate" });
    store.bindConversation("owner", { threadId: "thread-from-desktop" });

    expect(store.getConversation("owner")).toMatchObject({
      threadId: "thread-from-desktop",
    });
    expect(store.getConversation("teammate")?.threadId).toBe(
      "thread-teammate",
    );
    expect(fs.statSync(store.path("conversations.json")).mode & 0o777).toBe(
      0o600,
    );

    store.clearConversation("owner");
    expect(store.getConversation("owner")).toBeNull();
    expect(store.getConversation("teammate")?.threadId).toBe(
      "thread-teammate",
    );
  });

  it("does not let an older task completion overwrite a newer conversation binding", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-state-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.bindConversation("owner", { threadId: "thread-a" });
    const bindingAtTaskStart = store.getConversation("owner");
    store.bindConversation("owner", { threadId: "thread-b" });

    expect(
      store.bindConversationIfUnchanged(
        "owner",
        bindingAtTaskStart,
        "thread-a",
      ),
    ).toBe(false);
    expect(store.getConversation("owner")?.threadId).toBe("thread-b");

    expect(
      store.bindConversationIfUnchanged("new-user", null, "thread-new"),
    ).toBe(true);
    expect(store.getConversation("new-user")?.threadId).toBe("thread-new");
  });

  it("treats an explicit clear as a new generation even when no thread was bound", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-state-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const beforeClear = store.getConversationSnapshot("owner");

    store.clearConversation("owner");

    expect(
      store.bindConversationIfUnchanged(
        "owner",
        beforeClear.binding,
        "stale-thread",
        beforeClear.generation,
      ),
    ).toBe(false);
    expect(store.getConversation("owner")).toBeNull();
    expect(store.getConversationSnapshot("owner").generation).toBe(1);
  });
});
