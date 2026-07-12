import { describe, expect, it, vi } from "vitest";

import {
  WeixinTextDelivery,
  type WeixinTextSender,
} from "../src/weixin/delivery.js";
import { WeixinApiError } from "../src/weixin/client.js";

const session = {
  accountId: "bot",
  token: "token",
  userId: "owner",
  baseUrl: "https://ilinkai.weixin.qq.com",
  savedAt: "now",
};

describe("WeixinTextDelivery", () => {
  it("delivers a short message and reports the exact delivered text", async () => {
    const sendText = vi.fn<WeixinTextSender["sendText"]>().mockResolvedValue();
    const delivery = new WeixinTextDelivery(
      { sendText },
      { clientIdFactory: () => "chunk-1" },
    );

    const receipt = await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: "你好，CodeLink",
    });

    expect(sendText).toHaveBeenCalledWith({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: "你好，CodeLink",
      clientId: "chunk-1",
    });
    expect(receipt).toEqual({
      totalChunks: 1,
      sentChunks: 1,
      deliveredText: "你好，CodeLink",
    });
  });

  it("splits by UTF-8 bytes at a paragraph boundary", async () => {
    const firstParagraph = "你".repeat(682);
    const text = `${firstParagraph}\n\n第二段`;
    const sendText = vi.fn<WeixinTextSender["sendText"]>().mockResolvedValue();
    let id = 0;
    const delivery = new WeixinTextDelivery(
      { sendText },
      { clientIdFactory: () => `chunk-${++id}` },
    );

    const receipt = await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text,
    });

    expect(sendText.mock.calls.map(([call]) => call.text)).toEqual([
      `${firstParagraph}\n\n`,
      "第二段",
    ]);
    expect(
      sendText.mock.calls.every(
        ([call]) => Buffer.byteLength(call.text, "utf8") <= 2_048,
      ),
    ).toBe(true);
    expect(receipt).toEqual({
      totalChunks: 2,
      sentChunks: 2,
      deliveredText: text,
    });
  });

  it("moves a complete fenced code block instead of splitting inside it", async () => {
    const prefix = "a".repeat(2_035);
    const codeBlock = '```ts\nconst value = "hello";\n```\n';
    const sendText = vi.fn<WeixinTextSender["sendText"]>().mockResolvedValue();
    const delivery = new WeixinTextDelivery({ sendText });

    await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: `${prefix}\n${codeBlock}`,
    });

    expect(sendText.mock.calls.map(([call]) => call.text)).toEqual([
      `${prefix}\n`,
      codeBlock,
    ]);
  });

  it("keeps a multiline Markdown list item together when it fits", async () => {
    const prefix = "a".repeat(2_035);
    const listItem = "- first line\n  continued detail\n";
    const sendText = vi.fn<WeixinTextSender["sendText"]>().mockResolvedValue();
    const delivery = new WeixinTextDelivery({ sendText });

    await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: `${prefix}\n${listItem}`,
    });

    expect(sendText.mock.calls.map(([call]) => call.text)).toEqual([
      `${prefix}\n`,
      listItem,
    ]);
  });

  it("closes and reopens an oversized fenced block without losing source text", async () => {
    const text = `\`\`\`ts\n${"x".repeat(5_000)}\n\`\`\`\n`;
    const sendText = vi.fn<WeixinTextSender["sendText"]>().mockResolvedValue();
    const delivery = new WeixinTextDelivery(
      { sendText },
      { interChunkDelayMs: 0 },
    );

    const receipt = await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text,
    });

    const deliveredChunks = sendText.mock.calls.map(([call]) => call.text);
    expect(deliveredChunks.length).toBeGreaterThan(1);
    expect(
      deliveredChunks.every(
        (chunk) =>
          chunk.startsWith("```ts\n") &&
          chunk.endsWith("```\n") &&
          Buffer.byteLength(chunk, "utf8") <= 2_048,
      ),
    ).toBe(true);
    expect(receipt.deliveredText).toBe(text);
    expect(receipt.sentChunks).toBe(receipt.totalChunks);
  });

  it("serializes complete deliveries globally across instances", async () => {
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const sendText = vi.fn<WeixinTextSender["sendText"]>(async ({ text }) => {
      if (text === "first") await firstPending;
    });
    const firstDelivery = new WeixinTextDelivery({ sendText });
    const secondDelivery = new WeixinTextDelivery({ sendText });

    const first = firstDelivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: "first",
    });
    await vi.waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
    const second = secondDelivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: "second",
    });
    await Promise.resolve();

    expect(sendText).toHaveBeenCalledTimes(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(sendText.mock.calls.map(([call]) => call.text)).toEqual([
      "first",
      "second",
    ]);
  });

  it("uses the injected delay only between chunks", async () => {
    const events: string[] = [];
    const sendText = vi.fn<WeixinTextSender["sendText"]>(async ({ text }) => {
      events.push(`send:${Buffer.byteLength(text, "utf8")}`);
    });
    const sleep = vi.fn(async (milliseconds: number) => {
      events.push(`delay:${milliseconds}`);
    });
    const delivery = new WeixinTextDelivery(
      { sendText },
      { interChunkDelayMs: 125, sleep },
    );

    await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: "a".repeat(2_049),
    });

    expect(events).toEqual(["send:2048", "delay:125", "send:1"]);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("retries ret=-2 with finite backoff and the same chunk client ID", async () => {
    const sendText = vi.fn<WeixinTextSender["sendText"]>(async () => {
      if (sendText.mock.calls.length < 3) {
        throw new WeixinApiError(
          "sendmessage ret=-2: retry",
          undefined,
          undefined,
          -2,
        );
      }
    });
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    const delivery = new WeixinTextDelivery(
      { sendText },
      {
        clientIdFactory: () => "stable-retry-id",
        retryDelaysMs: [10, 20],
        sleep,
      },
    );

    const receipt = await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: "retry me",
    });

    expect(sendText).toHaveBeenCalledTimes(3);
    expect(sendText.mock.calls.map(([call]) => call.clientId)).toEqual([
      "stable-retry-id",
      "stable-retry-id",
      "stable-retry-id",
    ]);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
      10, 20,
    ]);
    expect(receipt).toEqual({
      totalChunks: 1,
      sentChunks: 1,
      deliveredText: "retry me",
    });
  });

  it("returns the delivered prefix and failed chunk without throwing", async () => {
    const sendText = vi.fn<WeixinTextSender["sendText"]>(async ({ text }) => {
      if (text === "尾") {
        throw new WeixinApiError(
          "sendmessage ret=-3: rejected",
          undefined,
          undefined,
          -3,
        );
      }
    });
    const delivery = new WeixinTextDelivery(
      { sendText },
      { interChunkDelayMs: 0 },
    );
    const deliveredPrefix = "a".repeat(2_048);

    const receipt = await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: `${deliveredPrefix}尾`,
    });

    expect(receipt).toEqual({
      totalChunks: 2,
      sentChunks: 1,
      deliveredText: deliveredPrefix,
      failedChunk: "尾",
      failedChunkIndex: 1,
      errorCode: -3,
      error: "sendmessage ret=-3: rejected",
    });
  });

  it("stops retrying ret=-2 after the configured backoff budget", async () => {
    const sendText = vi.fn<WeixinTextSender["sendText"]>(async () => {
      throw new WeixinApiError(
        "sendmessage ret=-2: still busy",
        undefined,
        undefined,
        -2,
      );
    });
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    const delivery = new WeixinTextDelivery(
      { sendText },
      {
        clientIdFactory: () => "same-id",
        retryDelaysMs: [10, 20],
        sleep,
      },
    );

    const receipt = await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: "give up",
    });

    expect(sendText).toHaveBeenCalledTimes(3);
    expect(sendText.mock.calls.map(([call]) => call.clientId)).toEqual([
      "same-id",
      "same-id",
      "same-id",
    ]);
    expect(receipt).toMatchObject({
      totalChunks: 1,
      sentChunks: 0,
      deliveredText: "",
      failedChunk: "give up",
      failedChunkIndex: 0,
      errorCode: -2,
    });
  });

  it("derives stable chunk client IDs from a durable delivery key", async () => {
    const firstSend = vi
      .fn<WeixinTextSender["sendText"]>()
      .mockRejectedValue(new Error("process interrupted"));
    const secondSend = vi
      .fn<WeixinTextSender["sendText"]>()
      .mockResolvedValue();
    const input = {
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: "durable result",
      deliveryKey: "task-42:result",
    };

    await new WeixinTextDelivery({ sendText: firstSend }).sendText(input);
    await new WeixinTextDelivery({ sendText: secondSend }).sendText(input);

    expect(firstSend.mock.calls[0]?.[0].clientId).toBe(
      secondSend.mock.calls[0]?.[0].clientId,
    );
    expect(secondSend.mock.calls[0]?.[0].clientId).toMatch(
      /^codelink-[a-f0-9]{32}$/,
    );
  });

  it("turns unexpected delivery dependency errors into a failure receipt", async () => {
    const sendText = vi.fn<WeixinTextSender["sendText"]>().mockResolvedValue();
    const delivery = new WeixinTextDelivery(
      { sendText },
      {
        clientIdFactory: () => {
          throw new Error("ID source unavailable");
        },
      },
    );

    const receipt = await delivery.sendText({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      text: "still report this",
    });

    expect(sendText).not.toHaveBeenCalled();
    expect(receipt).toEqual({
      totalChunks: 1,
      sentChunks: 0,
      deliveredText: "",
      failedChunk: "still report this",
      failedChunkIndex: 0,
      error: "ID source unavailable",
    });
  });
});
