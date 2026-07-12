import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "../src/config.js";
import type { RunTaskInput } from "../src/codex-task-runner.js";
import { CodelinkDaemon } from "../src/daemon.js";
import { StateStore, type WeixinSession } from "../src/state.js";
import type { WeixinClient } from "../src/weixin/client.js";
import type { WeixinMessage } from "../src/weixin/types.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("CodelinkDaemon", () => {
  it("accepts an authorized text message and replies with only the Codex answer", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi.fn<(input: { text: string }) => Promise<void>>(
      async () => undefined,
    );
    const setTyping = vi.fn<WeixinClient["setTyping"]>(
      async () => undefined,
    );
    const fakeClient = { sendText, setTyping } as unknown as WeixinClient;
    const runTask = vi.fn(async () => ({
      threadId: "thread-1",
      finalResponse: "all done",
      workspace: "/tmp/work",
      createdNewConversation: true,
      conversationIsCurrent: true,
    }));
    const daemon = new CodelinkDaemon(config, store, fakeClient, {
      runTask,
    });
    const message: WeixinMessage = {
      message_id: 99,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-99",
      item_list: [{ type: 1, text_item: { text: "please do it" } }],
    };

    await daemon.handleIncomingMessage(session, message);

    expect(store.getContextToken("owner")?.contextToken).toBe("context-99");
    expect(runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "99",
        fromUserId: "owner",
        prompt: "please do it",
        conversationAtReceipt: null,
      }),
    );
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0].text).toBe("all done");
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
  });

  it("uses temporary typing without sending a permanent acknowledgement", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi.fn<(input: { text: string }) => Promise<void>>(
      async () => undefined,
    );
    const setTyping = vi.fn<WeixinClient["setTyping"]>(
      async () => undefined,
    );
    let finishTask!: () => void;
    const taskPending = new Promise<void>((resolve) => {
      finishTask = resolve;
    });
    const runTask = vi.fn(async () => {
      await taskPending;
      return {
        threadId: "thread-with-typing",
        finalResponse: "task completed",
        createdNewConversation: true,
        conversationIsCurrent: true,
      };
    });
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText, setTyping } as unknown as WeixinClient,
      { runTask },
    );

    const handling = daemon.handleIncomingMessage(session, {
      message_id: 991,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-991",
      item_list: [{ type: 1, text_item: { text: "do it anyway" } }],
    });

    await vi.waitFor(() => expect(runTask).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(setTyping).toHaveBeenCalledTimes(1));
    expect(sendText).not.toHaveBeenCalled();

    finishTask();
    await handling;
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0].text).toBe("task completed");
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
  });

  it("keeps a successful execution successful when final WeChat delivery fails", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi
      .fn<(input: { text: string }) => Promise<void>>()
      .mockRejectedValueOnce(new Error("final transport failed"));
    const runTask = vi.fn(async ({ messageId }: { messageId: string }) => {
      store.updateTask(messageId, (current) => ({
        ...current,
        threadId: "thread-completed",
        status: "completed",
        completedAt: new Date().toISOString(),
      }));
      return {
        threadId: "thread-completed",
        finalResponse: "execution succeeded",
        createdNewConversation: true,
        conversationIsCurrent: true,
      };
    });
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask } as never,
    );

    await daemon.handleIncomingMessage(session, {
      message_id: 992,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-992",
      item_list: [{ type: 1, text_item: { text: "finish this" } }],
    });

    expect(store.findTask("992")).toMatchObject({
      status: "completed",
      delivery: { result: { status: "failed" } },
    });
    expect(store.findTask("992")?.error).toBeUndefined();
  });

  it("persists task acceptance before advancing the update cursor and keeps polling during a long task", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    let finishTask!: () => void;
    const taskPending = new Promise<void>((resolve) => {
      finishTask = resolve;
    });
    const runTask = vi.fn(async () => {
      await taskPending;
      return {
        threadId: "thread-long",
        finalResponse: "done",
        createdNewConversation: true,
        conversationIsCurrent: true,
      };
    });
    const getUpdates = vi
      .fn()
      .mockResolvedValueOnce({
        ret: 0,
        get_updates_buf: "cursor-1",
        msgs: [
          {
            message_id: 993,
            from_user_id: "owner",
            message_type: 1,
            context_token: "context-993",
            item_list: [{ type: 1, text_item: { text: "long task" } }],
          },
        ],
      })
      .mockResolvedValueOnce({
        ret: 0,
        get_updates_buf: "cursor-2",
        msgs: [],
      });
    const originalSaveCursor = store.saveSyncCursor.bind(store);
    vi.spyOn(store, "saveSyncCursor").mockImplementation((cursor) => {
      if (cursor === "cursor-1") {
        expect(store.findTask("993")?.status).toBe("accepted");
      }
      originalSaveCursor(cursor);
    });
    const daemon = new CodelinkDaemon(
      config,
      store,
      {
        getUpdates,
        sendText: vi.fn(async () => undefined),
      } as unknown as WeixinClient,
      { runTask },
    );

    await expect(daemon.pollOnce(session, "")).resolves.toBe("cursor-1");
    await vi.waitFor(() => expect(runTask).toHaveBeenCalledTimes(1));
    await expect(daemon.pollOnce(session, "cursor-1")).resolves.toBe(
      "cursor-2",
    );
    expect(getUpdates).toHaveBeenCalledTimes(2);

    finishTask();
    await daemon.waitForIdle();
  });

  it("dispatches a later reply while an earlier Codex turn is still running", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    store.bindConversation("owner", { threadId: "active-thread" });
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    let finishFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const runTask = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstPending;
        return {
          threadId: "active-thread",
          finalResponse: "first done",
          createdNewConversation: false,
          conversationIsCurrent: true,
        };
      })
      .mockResolvedValueOnce({
        threadId: "active-thread",
        finalResponse: "steered",
        createdNewConversation: false,
        conversationIsCurrent: true,
      });
    const setTyping = vi.fn<WeixinClient["setTyping"]>(
      async () => undefined,
    );
    const daemon = new CodelinkDaemon(
      config,
      store,
      {
        sendText: vi.fn(async () => undefined),
        setTyping,
      } as unknown as WeixinClient,
      { runTask },
    );

    const first = daemon.handleIncomingMessage(session, {
      message_id: 994,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-994",
      item_list: [{ type: 1, text_item: { text: "start long work" } }],
    });
    await vi.waitFor(() => expect(runTask).toHaveBeenCalledTimes(1));
    const second = daemon.handleIncomingMessage(session, {
      message_id: 995,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-995",
      item_list: [{ type: 1, text_item: { text: "adjust it now" } }],
    });

    await vi.waitFor(() => expect(runTask).toHaveBeenCalledTimes(2));
    await second;
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
    ]);
    await expect(daemon.drainBackgroundTasks(5)).resolves.toBe(false);
    finishFirst();
    await first;
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
    await expect(daemon.drainBackgroundTasks(5)).resolves.toBe(true);
  });

  it("routes two same-batch messages through the first pending thread instead of starting two", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    let revealThread!: () => void;
    let finishFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const runTask = vi
      .fn()
      .mockImplementationOnce(async (input: RunTaskInput) => {
        revealThread = () => input.onThreadStarted?.("pending-thread");
        await firstPending;
        return {
          threadId: "pending-thread",
          finalResponse: "first done",
          createdNewConversation: true,
          conversationIsCurrent: true,
        };
      })
      .mockResolvedValueOnce({
        threadId: "pending-thread",
        finalResponse: "second joined",
        createdNewConversation: false,
        conversationIsCurrent: true,
      });
    const daemon = new CodelinkDaemon(
      config,
      store,
      {
        getUpdates: vi.fn(async () => ({
          ret: 0,
          get_updates_buf: "cursor-batch",
          msgs: [
            {
              message_id: 996,
              from_user_id: "owner",
              message_type: 1,
              context_token: "context-996",
              item_list: [{ type: 1, text_item: { text: "first" } }],
            },
            {
              message_id: 997,
              from_user_id: "owner",
              message_type: 1,
              context_token: "context-997",
              item_list: [{ type: 1, text_item: { text: "second" } }],
            },
          ],
        })),
        sendText: vi.fn(async () => undefined),
      } as unknown as WeixinClient,
      { runTask },
    );

    await daemon.pollOnce(session, "");
    await vi.waitFor(() => expect(runTask).toHaveBeenCalledTimes(1));
    revealThread();
    await vi.waitFor(() => expect(runTask).toHaveBeenCalledTimes(2));
    expect(runTask.mock.calls[1]?.[0]).toMatchObject({
      messageId: "997",
      conversationAtReceipt: { threadId: "pending-thread" },
    });

    finishFirst();
    await daemon.waitForIdle();
  });

  it("recovers accepted work and safely interrupts running work after restart", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    store.saveContextToken("owner", "context-owner");
    store.acceptTask({
      messageId: "recover-accepted",
      fromUserId: "owner",
      prompt: "recover my request",
      promptPreview: "recover my request",
      conversationAtReceipt: null,
      status: "accepted",
      startedAt: "2026-07-12T00:00:00.000Z",
    });
    store.acceptTask({
      messageId: "recover-running",
      fromUserId: "teammate",
      threadId: "thread-already-started",
      prompt: "resume the interrupted request",
      promptPreview: "resume the interrupted request",
      startNew: true,
      conversationAtReceipt: null,
      status: "running",
      startedAt: "2026-07-12T00:01:00.000Z",
    });
    store.acceptTask({
      messageId: "recover-outbox",
      fromUserId: "owner",
      threadId: "thread-complete",
      prompt: "already executed",
      promptPreview: "already executed",
      status: "completed",
      startedAt: "2026-07-12T00:02:00.000Z",
      completedAt: "2026-07-12T00:03:00.000Z",
      delivery: {
        acknowledgement: {
          status: "pending",
          updatedAt: "2026-07-12T00:02:30.000Z",
          text: "legacy acknowledgement must not be sent",
          deliveryKey: "task:recover-outbox:acknowledgement",
        },
        result: {
          status: "pending",
          updatedAt: "2026-07-12T00:03:00.000Z",
          text: "persisted final result",
          deliveryKey: "task:recover-outbox:result",
        },
      },
    });
    const runTask = vi.fn(async (input: RunTaskInput) => ({
      threadId:
        input.messageId === "recover-running"
          ? "thread-already-started"
          : "thread-recovered",
      finalResponse: "recovered",
      createdNewConversation: input.messageId !== "recover-running",
      conversationIsCurrent: true,
    }));
    const sendText = vi.fn<(input: { text: string }) => Promise<void>>(
      async () => undefined,
    );
    const daemon = new CodelinkDaemon(
      defaultConfig(),
      store,
      { sendText } as unknown as WeixinClient,
      { runTask },
    );

    expect(daemon.recoverPendingTasks(session)).toBe(2);
    expect(daemon.recoverPendingDeliveries(session)).toBe(1);
    await daemon.waitForIdle();

    expect(runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "recover-accepted",
        prompt: "recover my request",
        recover: true,
      }),
    );
    expect(runTask).not.toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "recover-running" }),
    );
    expect(store.findTask("recover-accepted")?.status).toBe("completed");
    expect(store.findTask("recover-running")).toMatchObject({
      status: "failed",
      error: expect.stringContaining("避免重复执行"),
    });
    expect(store.findTask("recover-outbox")?.delivery?.result?.status).toBe(
      "sent",
    );
    expect(
      store.findTask("recover-outbox")?.delivery?.acknowledgement?.status,
    ).toBe("skipped");
    expect(
      sendText.mock.calls.some(
        ([input]) => input.text === "legacy acknowledgement must not be sent",
      ),
    ).toBe(false);
    expect(sendText.mock.calls.some(([input]) => input.text === "persisted final result"))
      .toBe(true);
  });

  it("marks health degraded and session-expired on WeChat errcode -14", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    const daemon = new CodelinkDaemon(
      defaultConfig(),
      store,
      {
        getUpdates: vi.fn(async () => ({ errcode: -14 })),
        sendText: vi.fn(async () => undefined),
      } as unknown as WeixinClient,
      { runTask: vi.fn() },
    );

    expect(daemon.getStatus()).toMatchObject({
      ok: false,
      degraded: false,
      sessionExpired: false,
    });
    await expect(daemon.pollOnce(session, "cursor-old")).rejects.toThrow(
      "重新运行 codelink login",
    );
    expect(daemon.getStatus()).toMatchObject({
      ok: false,
      degraded: true,
      sessionExpired: true,
    });
    expect(daemon.getStatus().lastPollErrorAt).toBeTruthy();
    expect(store.loadSyncCursor()).toBe("");
  });

  it("keeps durable prompt and outbox payloads out of the public task list", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.acceptTask({
      messageId: "private-task",
      fromUserId: "owner",
      prompt: "full private request",
      promptPreview: "private preview",
      conversationAtReceipt: {
        threadId: "private-thread",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
      status: "completed",
      startedAt: "2026-07-12T00:00:00.000Z",
      delivery: {
        result: {
          status: "pending",
          updatedAt: "2026-07-12T00:01:00.000Z",
          text: "full private result",
          deliveryKey: "private-delivery-key",
        },
      },
    });
    const daemon = new CodelinkDaemon(
      defaultConfig(),
      store,
      { sendText: vi.fn() } as unknown as WeixinClient,
      { runTask: vi.fn() },
    );

    const serialized = JSON.stringify(daemon.getRecentTasks());
    expect(serialized).toContain("private preview");
    expect(serialized).not.toContain("full private request");
    expect(serialized).not.toContain("full private result");
    expect(serialized).not.toContain("private-delivery-key");
    expect(serialized).not.toContain("conversationAtReceipt");
  });

  it("ignores a user outside the allowlist", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi.fn<(input: { text: string }) => Promise<void>>(
      async () => undefined,
    );
    const runTask = vi.fn();
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask },
    );

    await daemon.handleIncomingMessage(
      {
        accountId: "bot",
        token: "token",
        baseUrl: "https://example.test",
        savedAt: "now",
      } as never,
      {
        from_user_id: "stranger",
        message_type: 1,
        item_list: [{ type: 1, text_item: { text: "run this" } }],
      },
    );

    expect(runTask).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("clears the current binding when the user asks for a new conversation without a prompt", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    store.bindConversation("owner", { threadId: "old-thread" });
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi.fn<(input: { text: string }) => Promise<void>>(
      async () => undefined,
    );
    const runTask = vi.fn();
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask },
    );

    await daemon.handleIncomingMessage(session, {
      message_id: 100,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-100",
      item_list: [{ type: 1, text_item: { text: "/new" } }],
    });

    expect(store.getConversation("owner")).toBeNull();
    expect(runTask).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0].text).toBe(
      "新会话已开启，上一个会话的上下文不会带入。直接发送下一条消息即可开始。",
    );
  });

  it("starts a fresh thread when natural language includes a new-conversation prompt", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    store.bindConversation("owner", { threadId: "old-thread" });
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi.fn<(input: { text: string }) => Promise<void>>(
      async () => undefined,
    );
    const runTask = vi.fn(async () => ({
      threadId: "new-thread",
      finalResponse: "fresh answer",
      workspace: "/tmp/new",
      createdNewConversation: true,
      conversationIsCurrent: true,
    }));
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask },
    );

    await daemon.handleIncomingMessage(session, {
      message_id: 101,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-101",
      item_list: [
        {
          type: 1,
          text_item: { text: "重新开一个会话，帮我分析另一个问题" },
        },
      ],
    });

    expect(runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "101",
        fromUserId: "owner",
        prompt: "帮我分析另一个问题",
        conversationAtReceipt: null,
        startNew: true,
      }),
    );
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0].text).toBe(
      "新会话已开启，上一个会话的上下文不会带入。\n\nfresh answer",
    );
  });

  it("routes using the receipt-time binding without exposing a later switch", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    store.bindConversation("owner", { threadId: "thread-at-receipt" });
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi.fn<(input: { text: string }) => Promise<void>>(
      async () => undefined,
    );
    const runTask = vi.fn(async () => {
      store.bindConversation("owner", { threadId: "newer-desktop-thread" });
      return {
        threadId: "thread-at-receipt",
        finalResponse: "reply from the received thread",
        createdNewConversation: false,
        conversationIsCurrent: false,
      };
    });
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask },
    );

    await daemon.handleIncomingMessage(session, {
      message_id: 102,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-102",
      item_list: [{ type: 1, text_item: { text: "continue this" } }],
    });

    expect(runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "102",
        fromUserId: "owner",
        prompt: "continue this",
        conversationAtReceipt: expect.objectContaining({
          threadId: "thread-at-receipt",
        }),
      }),
    );
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0].text).toBe(
      "reply from the received thread",
    );
    expect(store.getConversation("owner")?.threadId).toBe(
      "newer-desktop-thread",
    );
  });

  it("binds the notifying desktop thread before sending a replyable task notification", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    store.saveContextToken("owner", "context-owner");
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi.fn<(input: { text: string }) => Promise<void>>(
      async (input) => {
        expect(store.getConversation("owner")?.threadId).toBe(
          "019f55b8-d06b-7213-98de-2815f865c43d",
        );
        expect(input.text).toContain("task completed");
      },
    );
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask: vi.fn() },
    );

    const result = await daemon.sendNotification(
      "task completed",
      undefined,
      "019f55b8-d06b-7213-98de-2815f865c43d",
    );

    expect(result).toEqual({
      ok: true,
      toUserId: "owner",
      conversationBound: true,
      threadId: "019f55b8-d06b-7213-98de-2815f865c43d",
    });
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0].text).toContain(
      "—— CodeLink 任务通知",
    );
    expect(sendText.mock.calls[0][0].text).toContain("可直接回复继续");
    expect(sendText.mock.calls[0][0].text).toContain("/new");
  });

  it("sends a clearly marked notification without changing the binding when thread metadata is unavailable", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    store.saveContextToken("owner", "context-owner");
    store.bindConversation("owner", { threadId: "previous-thread" });
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi.fn<(input: { text: string }) => Promise<void>>(
      async () => undefined,
    );
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask: vi.fn() },
    );

    const result = await daemon.sendNotification("progress update");

    expect(result).toEqual({
      ok: true,
      toUserId: "owner",
      conversationBound: false,
    });
    expect(store.getConversation("owner")?.threadId).toBe("previous-thread");
    expect(sendText.mock.calls[0][0].text).toContain("未切换当前 Codex 会话");
  });

  it("does not roll back a newer successful notification from the same thread", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    store.saveSession(session);
    store.saveContextToken("owner", "context-owner");
    store.bindConversation("owner", { threadId: "previous-thread" });
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    let rejectFirst: ((reason: Error) => void) | undefined;
    const sendText = vi
      .fn<(input: { text: string }) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask: vi.fn() },
    );
    const threadId = "019f55b8-d06b-7213-98de-2815f865c43d";

    const older = daemon.sendNotification("older", undefined, threadId);
    await vi.waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
    const newer = daemon.sendNotification("newer", undefined, threadId);
    rejectFirst?.(new Error("older notification failed"));

    await expect(older).rejects.toThrow("older notification failed");
    await expect(newer).resolves.toMatchObject({
      conversationBound: true,
      threadId,
    });
    expect(store.getConversation("owner")?.threadId).toBe(threadId);
  });
});
