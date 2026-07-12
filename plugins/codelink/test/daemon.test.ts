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
    const runNewTask = vi.fn(async () => ({
      threadId: "thread-1",
      finalResponse: "all done",
      workspace: "/tmp/work",
    }));
    const daemon = new CodelinkDaemon(config, store, fakeClient, {
      runNewTask,
    });
    const message: WeixinMessage = {
      message_id: 99,
      from_user_id: "owner",
      message_type: 1,
      context_token: "context-99",
      item_list: [{ type: 1, text_item: { text: "please do it" } }],
    };

    await (
      daemon as unknown as {
        processIncoming(
          session: WeixinSession,
          message: WeixinMessage,
        ): Promise<void>;
      }
    ).processIncoming(session, message);

    expect(store.getContextToken("owner")?.contextToken).toBe("context-99");
    expect(runNewTask).toHaveBeenCalledWith({
      messageId: "99",
      fromUserId: "owner",
      prompt: "please do it",
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
    const runNewTask = vi.fn();
    const daemon = new CodelinkDaemon(
      config,
      store,
      { sendText } as unknown as WeixinClient,
      { runNewTask },
    );

    await (
      daemon as unknown as {
        processIncoming(session: never, message: WeixinMessage): Promise<void>;
      }
    ).processIncoming(
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

    expect(runNewTask).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });
});
