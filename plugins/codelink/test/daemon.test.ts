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

function inboundMessageId(
  accountId: string,
  source: "message_id" | "seq",
  value: string | number,
): string {
  return `weixin:${encodeURIComponent(accountId)}:${source}:${String(value)}`;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function notificationFixture(params: {
  sendText: (input: { toUserId: string; text: string }) => Promise<void>;
  users?: string[];
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
  cleanup.push(dir);
  const store = new StateStore(dir);
  const users = params.users ?? ["owner"];
  store.saveSession({
    accountId: "bot",
    token: "token",
    userId: "owner",
    baseUrl: "https://ilinkai.weixin.qq.com",
    savedAt: "now",
  });
  for (const user of users) store.saveContextToken(user, `context-${user}`);
  const config = defaultConfig();
  config.security.allowedUserIds = users;
  return {
    store,
    daemon: new CodelinkDaemon(
      config,
      store,
      { sendText: params.sendText } as unknown as WeixinClient,
      { runTask: vi.fn() },
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
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
        messageId: inboundMessageId("bot", "message_id", 99),
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

  it.each([
    { name: "status", text: "/status", expectedSends: 1, expectedTasks: 0 },
    { name: "help", text: "/help", expectedSends: 1, expectedTasks: 0 },
    {
      name: "new conversation",
      text: "/new",
      expectedSends: 1,
      expectedTasks: 0,
    },
    {
      name: "natural new conversation",
      text: "重新开一个会话，帮我分析另一个问题",
      expectedSends: 1,
      expectedTasks: 1,
    },
    {
      name: "ordinary task",
      text: "do the work",
      expectedSends: 1,
      expectedTasks: 1,
    },
  ])(
    "durably deduplicates a replayed $name message",
    async ({ text, expectedSends, expectedTasks }) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
      cleanup.push(dir);
      const firstStore = new StateStore(dir);
      const session: WeixinSession = {
        accountId: "bot",
        token: "token",
        userId: "owner",
        baseUrl: "https://ilinkai.weixin.qq.com",
        savedAt: "now",
      };
      firstStore.saveSession(session);
      firstStore.bindConversation("owner", { threadId: "before-message" });
      const config = defaultConfig();
      config.security.allowedUserIds = ["owner"];
      const sendText = vi.fn(async () => undefined);
      const runTask = vi.fn(async () => ({
        threadId: "task-thread",
        finalResponse: "done",
        createdNewConversation: text.includes("新会话"),
        conversationIsCurrent: true,
      }));
      const message: WeixinMessage = {
        message_id: 700,
        from_user_id: "owner",
        message_type: 1,
        context_token: "context-700",
        item_list: [{ type: 1, text_item: { text } }],
      };

      await new CodelinkDaemon(
        config,
        firstStore,
        { sendText } as unknown as WeixinClient,
        { runTask },
      ).handleIncomingMessage(session, message);
      if (text === "/new") {
        firstStore.bindConversation("owner", { threadId: "after-command" });
      }

      const reloadedStore = new StateStore(dir);
      await new CodelinkDaemon(
        config,
        reloadedStore,
        { sendText } as unknown as WeixinClient,
        { runTask },
      ).handleIncomingMessage(session, message);

      expect(
        reloadedStore.hasProcessedMessage(
          inboundMessageId("bot", "message_id", 700),
        ),
      ).toBe(true);
      expect(sendText).toHaveBeenCalledTimes(expectedSends);
      expect(runTask).toHaveBeenCalledTimes(expectedTasks);
      if (text === "/new") {
        expect(reloadedStore.getConversation("owner")?.threadId).toBe(
          "after-command",
        );
      }
    },
  );

  it("redelivers a command reply when the process dies mid-delivery", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const firstStore = new StateStore(dir);
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    firstStore.saveSession(session);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const message: WeixinMessage = {
      message_id: 810,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-810",
      item_list: [{ type: 1, text_item: { text: "/status" } }],
    };
    const messageId = inboundMessageId("bot", "message_id", 810);

    // 投递挂起期间进程死亡：ledger 不得提前写入。
    let releaseFirstSend!: (value: undefined) => void;
    const hangingSend = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          releaseFirstSend = resolve;
        }),
    );
    const crashed = new CodelinkDaemon(
      config,
      firstStore,
      { sendText: hangingSend } as unknown as WeixinClient,
      { runTask: vi.fn() },
    ).handleIncomingMessage(session, message);
    await vi.waitFor(() => expect(hangingSend).toHaveBeenCalled());
    expect(firstStore.hasProcessedMessage(messageId)).toBe(false);

    // 重启后重放同一条消息：回复必须补发，然后才进入 ledger。
    const sendText = vi.fn(async () => undefined);
    const reloadedStore = new StateStore(dir);
    const replayed = new CodelinkDaemon(
      config,
      reloadedStore,
      { sendText } as unknown as WeixinClient,
      { runTask: vi.fn() },
    ).handleIncomingMessage(session, message);
    // 释放被挂起的首次投递，解除按用户串行的全局队列。
    releaseFirstSend(undefined);
    await Promise.all([crashed, replayed]);

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(reloadedStore.hasProcessedMessage(messageId)).toBe(true);
  });

  it("delivers a duplicated in-batch command reply only once", async () => {
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
    const sendText = vi.fn(
      async () => new Promise<undefined>((resolve) => setTimeout(resolve, 5)),
    );
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask: vi.fn() },
    );
    const message: WeixinMessage = {
      message_id: 811,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-811",
      item_list: [{ type: 1, text_item: { text: "/help" } }],
    };

    const first = daemon.handleIncomingMessage(session, message);
    const second = daemon.handleIncomingMessage(session, message);
    await Promise.all([first, second]);

    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it("derives a stable replay identity when upstream ids are absent", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const sendText = vi.fn(async () => undefined);
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask: vi.fn() },
    );
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    const message: WeixinMessage = {
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-derived",
      item_list: [{ type: 1, text_item: { text: "/status" } }],
    };

    await daemon.handleIncomingMessage(session, message);
    await daemon.handleIncomingMessage(session, message);

    expect(sendText).toHaveBeenCalledTimes(1);
    const replayState = JSON.parse(
      fs.readFileSync(store.path("processed-messages.json"), "utf8"),
    ) as { messageIds: string[] };
    expect(replayState.messageIds).toEqual([
      expect.stringMatching(/^weixin:bot:derived:[A-Za-z0-9_-]+$/),
    ]);
  });

  it("does not collide when message_id and seq contain the same numeric value", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };
    const runTask = vi.fn(async (_input: RunTaskInput) => ({
      threadId: "thread-identity",
      finalResponse: "done",
      createdNewConversation: true,
      conversationIsCurrent: true,
    }));
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText: vi.fn(async () => undefined) } as unknown as WeixinClient,
      { runTask },
    );
    const baseMessage = {
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-identity",
    } as const;

    await daemon.handleIncomingMessage(session, {
      ...baseMessage,
      message_id: 77,
      item_list: [{ type: 1, text_item: { text: "first task" } }],
    });
    await daemon.handleIncomingMessage(session, {
      ...baseMessage,
      seq: 77,
      item_list: [{ type: 1, text_item: { text: "second task" } }],
    });

    expect(runTask.mock.calls.map(([input]) => input.messageId)).toEqual([
      inboundMessageId("bot", "message_id", 77),
      inboundMessageId("bot", "seq", 77),
    ]);
  });

  it("does not collide when two WeChat accounts receive the same message id", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const runTask = vi.fn(async (_input: RunTaskInput) => ({
      threadId: "thread-account",
      finalResponse: "done",
      createdNewConversation: true,
      conversationIsCurrent: true,
    }));
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText: vi.fn(async () => undefined) } as unknown as WeixinClient,
      { runTask },
    );
    const message: WeixinMessage = {
      message_id: 78,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-account",
      item_list: [{ type: 1, text_item: { text: "account task" } }],
    };

    for (const accountId of ["bot-a", "bot-b"]) {
      await daemon.handleIncomingMessage(
        {
          accountId,
          token: `token-${accountId}`,
          userId: "owner",
          baseUrl: "https://ilinkai.weixin.qq.com",
          savedAt: "now",
        },
        message,
      );
    }

    expect(runTask.mock.calls.map(([input]) => input.messageId)).toEqual([
      inboundMessageId("bot-a", "message_id", 78),
      inboundMessageId("bot-b", "message_id", 78),
    ]);
  });

  it("recognizes an f9 raw task record when an old message is replayed after upgrade", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    store.acceptTask({
      messageId: "79",
      fromUserId: "owner",
      promptPreview: "legacy task",
      status: "completed",
      startedAt: "2026-07-12T00:00:00.000Z",
      completedAt: "2026-07-12T00:01:00.000Z",
    });
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner"];
    const runTask = vi.fn();
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText: vi.fn(async () => undefined) } as unknown as WeixinClient,
      { runTask },
    );
    const session: WeixinSession = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };

    await daemon.handleIncomingMessage(session, {
      message_id: 79,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-legacy",
      item_list: [{ type: 1, text_item: { text: "legacy task" } }],
    });

    expect(runTask).not.toHaveBeenCalled();
    expect(store.listTasks(500)).toHaveLength(1);
    expect(
      store.hasProcessedMessage(inboundMessageId("bot", "message_id", 79)),
    ).toBe(true);
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
    let finishTask!: () => void;
    const taskPending = new Promise<void>((resolve) => {
      finishTask = resolve;
    });
    const typingStart = deferred();
    let typingStartFinished = false;
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async (input) => {
      if (input.typing) {
        await typingStart.promise;
        typingStartFinished = true;
      }
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

    typingStart.resolve();
    await vi.waitFor(() => expect(typingStartFinished).toBe(true));
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

    const taskId = inboundMessageId("bot", "message_id", 992);
    expect(store.findTask(taskId)).toMatchObject({
      status: "completed",
      delivery: { result: { status: "failed" } },
    });
    expect(store.findTask(taskId)?.error).toBeUndefined();
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
    const typingStart = deferred();
    let typingStartFinished = false;
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async (input) => {
      if (input.typing) {
        await typingStart.promise;
        typingStartFinished = true;
      }
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
        const taskId = inboundMessageId("bot", "message_id", 993);
        expect(store.findTask(taskId)?.status).toBe("accepted");
        expect(store.hasProcessedMessage(taskId)).toBe(true);
        expect(typingStartFinished).toBe(false);
      }
      originalSaveCursor(cursor);
    });
    const daemon = new CodelinkDaemon(
      config,
      store,
      {
        getUpdates,
        sendText: vi.fn(async () => undefined),
        setTyping,
      } as unknown as WeixinClient,
      { runTask },
    );

    await expect(daemon.pollOnce(session, "")).resolves.toBe("cursor-1");
    await vi.waitFor(() => expect(runTask).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(setTyping).toHaveBeenCalledTimes(1));
    expect(typingStartFinished).toBe(false);
    await expect(daemon.pollOnce(session, "cursor-1")).resolves.toBe(
      "cursor-2",
    );
    expect(getUpdates).toHaveBeenCalledTimes(2);
    expect(typingStartFinished).toBe(false);

    typingStart.resolve();
    await vi.waitFor(() => expect(typingStartFinished).toBe(true));
    finishTask();
    await daemon.waitForIdle();
    expect(setTyping.mock.calls.map(([input]) => input.typing)).toEqual([
      true,
      false,
    ]);
  });

  it.each([
    { name: "status", messageId: 801, text: "/status" },
    { name: "help", messageId: 802, text: "/help" },
    { name: "new conversation", messageId: 803, text: "/new" },
  ])(
    "keeps $name replayable until its pending reply settles",
    async ({ messageId, text }) => {
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
      store.saveContextToken("owner", "context-command");
      const config = defaultConfig();
      config.security.allowedUserIds = ["owner"];
      let finishDelivery!: () => void;
      const pendingDelivery = new Promise<void>((resolve) => {
        finishDelivery = resolve;
      });
      let deliveryFinished = false;
      const sendText = vi.fn(async () => {
        await pendingDelivery;
        deliveryFinished = true;
      });
      const getUpdates = vi.fn(async () => ({
        ret: 0,
        get_updates_buf: "cursor-command",
        msgs: [
          {
            message_id: messageId,
            from_user_id: "owner",
            message_type: 1,
            context_token: "context-command",
            item_list: [{ type: 1, text_item: { text } }],
          },
        ],
      }));
      const originalSaveCursor = store.saveSyncCursor.bind(store);
      let daemon!: CodelinkDaemon;
      vi.spyOn(store, "saveSyncCursor").mockImplementation((cursor) => {
        // 回复尚未送达前不得写 ledger：此处崩溃时重放会重新执行幂等命令并补发回复。
        expect(
          store.hasProcessedMessage(
            inboundMessageId("bot", "message_id", messageId),
          ),
        ).toBe(false);
        expect(deliveryFinished).toBe(false);
        expect(daemon.getStatus().activeTasks).toBe(1);
        originalSaveCursor(cursor);
      });
      daemon = new CodelinkDaemon(
        config,
        store,
        { getUpdates, sendText } as unknown as WeixinClient,
        { runTask: vi.fn() },
      );

      await expect(daemon.pollOnce(session, "")).resolves.toBe(
        "cursor-command",
      );
      await vi.waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
      expect(deliveryFinished).toBe(false);

      finishDelivery();
      await daemon.waitForIdle();
      expect(deliveryFinished).toBe(true);
      expect(
        store.hasProcessedMessage(
          inboundMessageId("bot", "message_id", messageId),
        ),
      ).toBe(true);
    },
  );

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
      messageId: inboundMessageId("bot", "message_id", 997),
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

  it("ignores an unauthorized message without persisting or logging secrets", async () => {
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
    const filesBeforeMessage = fs.readdirSync(dir).sort();
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await daemon.handleIncomingMessage(
      {
        accountId: "bot",
        token: "token",
        baseUrl: "https://example.test",
        savedAt: "now",
      } as never,
      {
        message_id: 998,
        from_user_id: "stranger-sensitive-id",
        message_type: 1,
        context_token: "unauthorized-context-token",
        item_list: [{ type: 1, text_item: { text: "run this" } }],
      },
    );

    expect(runTask).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(store.getContextToken("stranger-sensitive-id")).toBeNull();
    expect(store.hasProcessedMessage("998")).toBe(false);
    expect(fs.readdirSync(dir).sort()).toEqual(filesBeforeMessage);
    expect(stderr).toHaveBeenCalledWith("忽略未授权微信消息\n");
    const logged = stderr.mock.calls.flat().join("");
    expect(logged).not.toContain("stranger-sensitive-id");
    expect(logged).not.toContain("unauthorized-context-token");
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
        messageId: inboundMessageId("bot", "message_id", 101),
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
        messageId: inboundMessageId("bot", "message_id", 102),
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
    const setTyping = vi.fn<WeixinClient["setTyping"]>(async () => undefined);
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText, setTyping } as unknown as WeixinClient,
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
    expect(setTyping).not.toHaveBeenCalled();
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

  it("rejects a queued default-user notification if the captured WeChat session changes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-daemon-"));
    cleanup.push(dir);
    const store = new StateStore(dir);
    const sessionA: WeixinSession = {
      accountId: "bot-a",
      token: "token-a",
      userId: "owner-a",
      baseUrl: "https://account-a.example.invalid",
      savedAt: "now-a",
    };
    store.saveSession(sessionA);
    store.saveContextToken("owner-a", "context-owner-a");
    const config = defaultConfig();
    config.security.allowedUserIds = ["owner-a", "owner-b"];
    const firstSend = deferred();
    const sendText = vi
      .fn<
        (input: {
          session: WeixinSession;
          toUserId: string;
          text: string;
        }) => Promise<void>
      >()
      .mockImplementationOnce(() => firstSend.promise)
      .mockResolvedValueOnce(undefined);
    const contextReads = vi.spyOn(store, "getContextToken");
    const bindings = vi.spyOn(store, "bindConversation");
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runTask: vi.fn() },
    );
    const firstThread = "019f55b8-d06b-7213-98de-2815f865c43d";
    const secondThread = "019f55b8-d06b-7213-98de-2815f865c43e";

    const first = daemon.sendNotification("first", undefined, firstThread);
    await vi.waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
    const second = daemon.sendNotification("second", undefined, secondThread);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(sendText).toHaveBeenCalledTimes(1);
    const contextReadsBeforeSessionChange = contextReads.mock.calls.length;
    const bindingsBeforeSessionChange = bindings.mock.calls.length;

    store.saveSession({
      accountId: "bot-b",
      token: "token-b",
      userId: "owner-b",
      baseUrl: "https://account-b.example.invalid",
      savedAt: "now-b",
    });
    firstSend.resolve();

    await expect(first).resolves.toMatchObject({ threadId: firstThread });
    await expect(second).rejects.toThrow(
      "微信会话已在通知排队期间发生变化，请重试",
    );
    expect(contextReads).toHaveBeenCalledTimes(contextReadsBeforeSessionChange);
    expect(bindings).toHaveBeenCalledTimes(bindingsBeforeSessionChange);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0].session).toEqual(sessionA);
    expect(store.getConversation("owner-a")?.threadId).toBe(firstThread);
  });

  it("starts a queued success only after an earlier failure fully rolls back", async () => {
    const firstSend = deferred();
    let secondSnapshotAtSend: ReturnType<
      StateStore["getConversationSnapshot"]
    > | null = null;
    const sendText = vi
      .fn<(input: { toUserId: string; text: string }) => Promise<void>>()
      .mockImplementationOnce(() => firstSend.promise)
      .mockImplementationOnce(async () => {
        secondSnapshotAtSend = store.getConversationSnapshot("owner");
      });
    const { daemon, store } = notificationFixture({ sendText });
    store.bindConversation("owner", { threadId: "previous-thread" });
    const firstThread = "019f55b8-d06b-7213-98de-2815f865c43d";
    const secondThread = "019f55b8-d06b-7213-98de-2815f865c43e";

    const first = daemon.sendNotification("first", undefined, firstThread);
    await vi.waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
    const second = daemon.sendNotification("second", undefined, secondThread);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const bindingWhileFirstPending = store.getConversation("owner")?.threadId;
    firstSend.reject(new Error("first send failed"));
    await expect(first).rejects.toThrow("first send failed");
    await expect(second).resolves.toMatchObject({ threadId: secondThread });
    expect(bindingWhileFirstPending).toBe(firstThread);
    expect(secondSnapshotAtSend).not.toBeNull();
    expect(store.getConversationSnapshot("owner")).toEqual(
      secondSnapshotAtSend,
    );
  });

  it("restores the last successful full snapshot when the next send fails", async () => {
    const sendText = vi
      .fn<(input: { toUserId: string; text: string }) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("second send failed"));
    const { daemon, store } = notificationFixture({ sendText });
    store.bindConversation("owner", { threadId: "previous-thread" });
    const firstThread = "019f55b8-d06b-7213-98de-2815f865c43d";
    const secondThread = "019f55b8-d06b-7213-98de-2815f865c43e";

    await daemon.sendNotification("first", undefined, firstThread);
    const successfulSnapshot = store.getConversationSnapshot("owner");
    await expect(
      daemon.sendNotification("second", undefined, secondThread),
    ).rejects.toThrow("second send failed");

    expect(store.getConversationSnapshot("owner")).toEqual(successfulSnapshot);
  });

  it("restores the original full snapshot when all queued sends fail", async () => {
    const firstSend = deferred();
    const sendText = vi
      .fn<(input: { toUserId: string; text: string }) => Promise<void>>()
      .mockImplementationOnce(() => firstSend.promise)
      .mockRejectedValueOnce(new Error("second send failed"));
    const { daemon, store } = notificationFixture({ sendText });
    store.bindConversation("owner", { threadId: "previous-thread" });
    const originalSnapshot = store.getConversationSnapshot("owner");

    const first = daemon.sendNotification(
      "first",
      undefined,
      "019f55b8-d06b-7213-98de-2815f865c43d",
    );
    await vi.waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
    const second = daemon.sendNotification(
      "second",
      undefined,
      "019f55b8-d06b-7213-98de-2815f865c43e",
    );
    firstSend.reject(new Error("first send failed"));

    await Promise.all([
      expect(first).rejects.toThrow("first send failed"),
      expect(second).rejects.toThrow("second send failed"),
    ]);
    expect(store.getConversationSnapshot("owner")).toEqual(originalSnapshot);
    expect(
      store.bindConversationIfUnchanged(
        "owner",
        originalSnapshot.binding,
        "task-completed-after-rollback",
        originalSnapshot.generation,
      ),
    ).toBe(true);
  });

  it("allows complete notification transactions for different users to run in parallel", async () => {
    const ownerSend = deferred();
    const teammateSend = deferred();
    const sendText = vi.fn(
      async (input: { toUserId: string; text: string }) =>
        input.toUserId === "owner" ? ownerSend.promise : teammateSend.promise,
    );
    const { daemon, store } = notificationFixture({
      sendText,
      users: ["owner", "teammate"],
    });
    const ownerThread = "019f55b8-d06b-7213-98de-2815f865c43d";
    const teammateThread = "019f55b8-d06b-7213-98de-2815f865c43e";

    const owner = daemon.sendNotification("owner", "owner", ownerThread);
    const teammate = daemon.sendNotification(
      "teammate",
      "teammate",
      teammateThread,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    const callsWhileBothPending = sendText.mock.calls.length;

    expect(store.getConversation("owner")?.threadId).toBe(ownerThread);
    expect(store.getConversation("teammate")?.threadId).toBe(teammateThread);
    ownerSend.resolve();
    teammateSend.resolve();
    await Promise.all([owner, teammate]);
    expect(callsWhileBothPending).toBe(2);
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
