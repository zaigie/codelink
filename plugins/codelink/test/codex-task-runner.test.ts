import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CodexTaskRunner } from "../src/codex-task-runner.js";
import { defaultConfig } from "../src/config.js";
import { StateStore } from "../src/state.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("CodexTaskRunner", () => {
  it("creates and binds a CodeLink-aware conversation when no binding exists", async () => {
    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-state-"),
    );
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-work-"),
    );
    cleanup.push(stateDir, workspaceRoot);
    const store = new StateStore(stateDir);
    const config = {
      ...defaultConfig().codex,
      taskWorkspaceRoot: workspaceRoot,
    };
    const runNewThread = vi.fn(
      async (_options: unknown, _prompt: string) => ({
        threadId: "thread-123",
        finalResponse: "finished",
      }),
    );
    const continueThread = vi.fn();
    const runner = new CodexTaskRunner(config, store, {
      runNewThread,
      continueThread,
    });

    const result = await runner.runTask({
      messageId: "m1",
      fromUserId: "owner",
      prompt: "do the work",
    });

    expect(result.threadId).toBe("thread-123");
    expect(result.workspace).toBe(workspaceRoot);
    expect(fs.statSync(workspaceRoot).isDirectory()).toBe(true);
    expect(runNewThread).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: workspaceRoot,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        developerInstructions: expect.stringContaining(
          "CodeLink 是本会话默认的微信桥接能力",
        ),
      }),
      "do the work",
    );
    const newThreadOptions = runNewThread.mock.calls[0]?.[0] as
      | { developerInstructions?: string }
      | undefined;
    expect(newThreadOptions?.developerInstructions).toContain(
      "不要强制用户记忆或使用 /new",
    );
    expect(newThreadOptions?.developerInstructions).toContain(
      "通知我",
    );
    expect(newThreadOptions?.developerInstructions).toContain(
      "send_wechat_message",
    );
    expect(continueThread).not.toHaveBeenCalled();
    expect(result.createdNewConversation).toBe(true);
    expect(result.conversationIsCurrent).toBe(true);
    expect(store.getConversation("owner")?.threadId).toBe("thread-123");
    expect(store.findTask("m1")).toMatchObject({
      status: "completed",
      threadId: "thread-123",
    });
  });

  it("groups separate new conversations under the shared CodeLink workspace", async () => {
    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-state-"),
    );
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-work-"),
    );
    cleanup.push(stateDir, workspaceRoot);
    const store = new StateStore(stateDir);
    const runNewThread = vi
      .fn()
      .mockResolvedValueOnce({
        threadId: "thread-one",
        finalResponse: "first",
      })
      .mockResolvedValueOnce({
        threadId: "thread-two",
        finalResponse: "second",
      });
    const runner = new CodexTaskRunner(
      { ...defaultConfig().codex, taskWorkspaceRoot: workspaceRoot },
      store,
      { runNewThread, continueThread: vi.fn() },
    );

    const first = await runner.runTask({
      messageId: "group-one",
      fromUserId: "owner",
      prompt: "first topic",
    });
    const second = await runner.runTask({
      messageId: "group-two",
      fromUserId: "owner",
      prompt: "second topic",
      startNew: true,
    });

    expect(first.threadId).toBe("thread-one");
    expect(second.threadId).toBe("thread-two");
    expect(first.workspace).toBe(workspaceRoot);
    expect(second.workspace).toBe(workspaceRoot);
    expect(runNewThread.mock.calls.map(([options]) => options.cwd)).toEqual([
      workspaceRoot,
      workspaceRoot,
    ]);
    expect(fs.readdirSync(workspaceRoot)).toEqual([]);
  });

  it("binds a new thread as soon as App Server starts it", async () => {
    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-state-"),
    );
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-work-"),
    );
    cleanup.push(stateDir, workspaceRoot);
    const store = new StateStore(stateDir);
    const config = {
      ...defaultConfig().codex,
      taskWorkspaceRoot: workspaceRoot,
    };
    let finishThread!: (value: {
      threadId: string;
      finalResponse: string;
    }) => void;
    const runNewThread = vi.fn(
      (options: {
        onThreadStarted?: (thread: { threadId: string }) => void;
      }) => {
        options.onThreadStarted?.({ threadId: "thread-early" });
        return new Promise<{ threadId: string; finalResponse: string }>(
          (resolve) => {
            finishThread = resolve;
          },
        );
      },
    );
    const runner = new CodexTaskRunner(config, store, {
      runNewThread: runNewThread as never,
      continueThread: vi.fn(),
    });

    const running = runner.runTask({
      messageId: "m-early",
      fromUserId: "owner",
      prompt: "long new task",
    });

    await vi.waitFor(() =>
      expect(store.getConversation("owner")?.threadId).toBe("thread-early"),
    );
    expect(store.findTask("m-early")).toMatchObject({
      status: "running",
      threadId: "thread-early",
    });
    finishThread({
      threadId: "thread-early",
      finalResponse: "finished",
    });
    await expect(running).resolves.toMatchObject({
      threadId: "thread-early",
      conversationIsCurrent: true,
    });
  });

  it("continues the bound Codex conversation by thread id", async () => {
    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-state-"),
    );
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-work-"),
    );
    cleanup.push(stateDir, workspaceRoot);
    const store = new StateStore(stateDir);
    store.bindConversation("owner", { threadId: "desktop-thread" });
    const config = {
      ...defaultConfig().codex,
      taskWorkspaceRoot: workspaceRoot,
    };
    const runNewThread = vi.fn();
    const continueThread = vi.fn(async () => ({
      threadId: "desktop-thread",
      finalResponse: "continued answer",
      cwd: "/existing/project",
    }));
    const runner = new CodexTaskRunner(config, store, {
      runNewThread,
      continueThread,
    });

    const result = await runner.runTask({
      messageId: "m2",
      fromUserId: "owner",
      prompt: "follow up",
    });

    expect(runNewThread).not.toHaveBeenCalled();
    expect(continueThread).toHaveBeenCalledWith(
      expect.any(Object),
      "desktop-thread",
      "follow up",
    );
    expect(result).toMatchObject({
      threadId: "desktop-thread",
      finalResponse: "continued answer",
      workspace: "/existing/project",
      createdNewConversation: false,
      conversationIsCurrent: true,
    });
    expect(store.findTask("m2")).toMatchObject({
      threadId: "desktop-thread",
      status: "completed",
    });
  });

  it("keeps a newer desktop binding when an older WeChat turn completes", async () => {
    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-state-"),
    );
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-work-"),
    );
    cleanup.push(stateDir, workspaceRoot);
    const store = new StateStore(stateDir);
    store.bindConversation("owner", { threadId: "wechat-thread" });
    const config = {
      ...defaultConfig().codex,
      taskWorkspaceRoot: workspaceRoot,
    };
    let finishTurn: ((value: {
      threadId: string;
      finalResponse: string;
      cwd: string;
    }) => void) | undefined;
    const continueThread = vi.fn(
      () =>
        new Promise<{
          threadId: string;
          finalResponse: string;
          cwd: string;
        }>((resolve) => {
          finishTurn = resolve;
        }),
    );
    const runner = new CodexTaskRunner(config, store, {
      runNewThread: vi.fn(),
      continueThread,
    });

    const running = runner.runTask({
      messageId: "m3",
      fromUserId: "owner",
      prompt: "long-running follow up",
    });
    await vi.waitFor(() => expect(continueThread).toHaveBeenCalledOnce());
    store.bindConversation("owner", { threadId: "newer-desktop-thread" });
    finishTurn?.({
      threadId: "wechat-thread",
      finalResponse: "older turn finished",
      cwd: "/existing/project",
    });

    await expect(running).resolves.toMatchObject({
      threadId: "wechat-thread",
      finalResponse: "older turn finished",
      conversationIsCurrent: false,
    });
    expect(store.getConversation("owner")?.threadId).toBe(
      "newer-desktop-thread",
    );
  });

  it("does not let an older pending thread bind after an explicit new-conversation generation", async () => {
    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-state-"),
    );
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-work-"),
    );
    cleanup.push(stateDir, workspaceRoot);
    const store = new StateStore(stateDir);
    const starts: Array<{
      onThreadStarted?: (thread: { threadId: string }) => void;
      finish: (result: { threadId: string; finalResponse: string }) => void;
    }> = [];
    const runNewThread = vi.fn(
      (options: {
        onThreadStarted?: (thread: { threadId: string }) => void;
      }) =>
        new Promise<{ threadId: string; finalResponse: string }>((resolve) => {
          starts.push({ onThreadStarted: options.onThreadStarted, finish: resolve });
        }),
    );
    const runner = new CodexTaskRunner(
      { ...defaultConfig().codex, taskWorkspaceRoot: workspaceRoot },
      store,
      { runNewThread: runNewThread as never, continueThread: vi.fn() },
    );
    const firstSnapshot = store.getConversationSnapshot("owner");
    const first = runner.runTask({
      messageId: "generation-old",
      fromUserId: "owner",
      prompt: "old pending request",
      conversationAtReceipt: firstSnapshot.binding,
      conversationGenerationAtReceipt: firstSnapshot.generation,
    });
    await vi.waitFor(() => expect(starts).toHaveLength(1));

    store.clearConversation("owner");
    const secondSnapshot = store.getConversationSnapshot("owner");
    const second = runner.runTask({
      messageId: "generation-new",
      fromUserId: "owner",
      prompt: "explicit new request",
      startNew: true,
      conversationAtReceipt: secondSnapshot.binding,
      conversationGenerationAtReceipt: secondSnapshot.generation,
    });
    await vi.waitFor(() => expect(starts).toHaveLength(2));

    starts[0]?.onThreadStarted?.({ threadId: "stale-thread" });
    expect(store.getConversation("owner")).toBeNull();
    starts[1]?.onThreadStarted?.({ threadId: "fresh-thread" });
    expect(store.getConversation("owner")?.threadId).toBe("fresh-thread");
    starts[0]?.finish({
      threadId: "stale-thread",
      finalResponse: "stale finished",
    });
    starts[1]?.finish({
      threadId: "fresh-thread",
      finalResponse: "fresh finished",
    });

    await expect(first).resolves.toMatchObject({
      conversationIsCurrent: false,
    });
    await expect(second).resolves.toMatchObject({
      conversationIsCurrent: true,
    });
    expect(store.getConversation("owner")?.threadId).toBe("fresh-thread");
  });
});
