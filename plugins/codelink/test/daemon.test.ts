import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "../src/config.js";
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
  it("accepts an authorized text message, stores context, creates a task, and replies", async () => {
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
    const fakeClient = { sendText } as unknown as WeixinClient;
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
    expect(runTask).toHaveBeenCalledWith({
      messageId: "99",
      fromUserId: "owner",
      prompt: "please do it",
      conversationAtReceipt: null,
    });
    expect(sendText).toHaveBeenCalledTimes(2);
    expect(sendText.mock.calls[1][0].text).toContain("thread-1");
    expect(sendText.mock.calls[1][0].text).toContain("all done");
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
    expect(sendText.mock.calls[0][0].text).toContain("新会话");
    expect(sendText.mock.calls[0][0].text).toContain("下一条消息");
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

    expect(runTask).toHaveBeenCalledWith({
      messageId: "101",
      fromUserId: "owner",
      prompt: "帮我分析另一个问题",
      conversationAtReceipt: null,
      startNew: true,
    });
    expect(sendText.mock.calls[0][0].text).toContain("创建新 Codex 会话");
    expect(sendText.mock.calls[1][0].text).toContain("新会话已回复");
  });

  it("routes a message using the binding captured before the acknowledgement", async () => {
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
      async () => {
        if (sendText.mock.calls.length === 1) {
          store.bindConversation("owner", { threadId: "newer-desktop-thread" });
        }
      },
    );
    const runTask = vi.fn(async () => ({
      threadId: "thread-at-receipt",
      finalResponse: "reply from the received thread",
      createdNewConversation: false,
      conversationIsCurrent: false,
    }));
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

    expect(runTask).toHaveBeenCalledWith({
      messageId: "102",
      fromUserId: "owner",
      prompt: "continue this",
      conversationAtReceipt: expect.objectContaining({
        threadId: "thread-at-receipt",
      }),
    });
    expect(sendText.mock.calls[1][0].text).toContain("微信当前会话已切换");
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
    await expect(
      daemon.sendNotification("newer", undefined, threadId),
    ).resolves.toMatchObject({ conversationBound: true, threadId });
    rejectFirst?.(new Error("older notification failed"));

    await expect(older).rejects.toThrow("older notification failed");
    expect(store.getConversation("owner")?.threadId).toBe(threadId);
  });
});
