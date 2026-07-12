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
});
