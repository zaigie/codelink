import { describe, expect, it, vi } from "vitest";

import { defaultConfig } from "../src/config.js";
import { WeixinClient } from "../src/weixin/client.js";

describe("WeixinClient", () => {
  it("requests a QR code using the Tencent iLink endpoint and bot headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          qrcode: "id",
          qrcode_img_content: "https://example.test/qr",
        }),
        { status: 200 },
      ),
    );
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);

    const result = await client.getQrCode(["old-token"]);

    expect(result.qrcode).toBe("id");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/ilink/bot/get_bot_qrcode?bot_type=3");
    expect(init?.headers).toMatchObject({
      "iLink-App-Id": "bot",
      AuthorizationType: "ilink_bot_token",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      local_token_list: ["old-token"],
    });
  });

  it("supports the legacy standalone GET QR endpoint for compatibility diagnosis", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          qrcode: "legacy",
          qrcode_img_content: "https://example.test/legacy",
        }),
        { status: 200 },
      ),
    );
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);

    await client.getQrCodeLegacy();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/ilink/bot/get_bot_qrcode?bot_type=3");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({});
  });

  it("uses only client version 1 when polling a legacy QR status", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "wait" }), { status: 200 }),
      );
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);

    await client.getQrStatusLegacy("legacy-code");

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toEqual({ "iLink-App-ClientVersion": "1" });
  });

  it("sends text with the current context token and complete bot message envelope", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ret: 0 }), { status: 200 }),
      );
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);

    await client.sendText({
      session: {
        accountId: "bot",
        token: "token",
        userId: "owner",
        baseUrl: "https://ilinkai.weixin.qq.com",
        savedAt: "now",
      },
      toUserId: "owner",
      contextToken: "ctx",
      text: "done",
      clientId: "stable-chunk-id",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.msg).toMatchObject({
      from_user_id: "",
      to_user_id: "owner",
      message_type: 2,
      message_state: 2,
      context_token: "ctx",
      client_id: "stable-chunk-id",
    });
    expect(body.msg.item_list[0].text_item.text).toBe("done");
    expect(body.base_info.bot_agent).toBe("CodeLink/0.1.0");
  });

  it("starts the official iLink typing state with a per-user typing ticket", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ret: 0, typing_ticket: "typing-ticket" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ret: 0 }), { status: 200 }),
      );
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);
    const session = {
      accountId: "bot",
      token: "token",
      userId: "owner",
      baseUrl: "https://ilinkai.weixin.qq.com",
      savedAt: "now",
    };

    await client.setTyping({
      session,
      toUserId: "owner",
      contextToken: "ctx",
      typing: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [configUrl, configInit] = fetchMock.mock.calls[0];
    expect(String(configUrl)).toContain("/ilink/bot/getconfig");
    expect(JSON.parse(String(configInit?.body))).toMatchObject({
      ilink_user_id: "owner",
      context_token: "ctx",
    });
    const [typingUrl, typingInit] = fetchMock.mock.calls[1];
    expect(String(typingUrl)).toContain("/ilink/bot/sendtyping");
    expect(JSON.parse(String(typingInit?.body))).toMatchObject({
      ilink_user_id: "owner",
      typing_ticket: "typing-ticket",
      status: 1,
    });
  });

  it("accepts an empty successful sendtyping response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ret: 0, typing_ticket: "typing-ticket" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);

    await expect(
      client.setTyping({
        session: {
          accountId: "bot",
          token: "token",
          userId: "owner",
          baseUrl: "https://ilinkai.weixin.qq.com",
          savedAt: "now",
        },
        toUserId: "owner",
        contextToken: "ctx",
        typing: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("reuses the typing ticket when cancelling the same user's typing state", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ret: 0, typing_ticket: "typing-ticket" }),
          { status: 200 },
        ),
      )
      .mockImplementation(async () =>
        new Response(JSON.stringify({ ret: 0 }), { status: 200 }),
      );
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);
    const params = {
      session: {
        accountId: "bot",
        token: "token",
        userId: "owner",
        baseUrl: "https://ilinkai.weixin.qq.com",
        savedAt: "now",
      },
      toUserId: "owner",
      contextToken: "ctx",
    };

    await client.setTyping({ ...params, typing: true });
    await client.setTyping({ ...params, typing: false });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [typingUrl, typingInit] = fetchMock.mock.calls[2];
    expect(String(typingUrl)).toContain("/ilink/bot/sendtyping");
    expect(JSON.parse(String(typingInit?.body))).toMatchObject({
      typing_ticket: "typing-ticket",
      status: 2,
    });
  });

  it.each([
    [
      "transport TypeError",
      async (): Promise<Response> => {
        throw new TypeError("network disconnected");
      },
    ],
    [
      "HTTP failure",
      async (): Promise<Response> =>
        new Response("upstream unavailable", { status: 502 }),
    ],
    [
      "invalid JSON response",
      async (): Promise<Response> =>
        new Response("not-json", { status: 200 }),
    ],
  ])(
    "reuses the typing ticket after an ambiguous %s",
    async (_failureName, failFirstTypingRequest) => {
      let typingAttempts = 0;
      const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path.endsWith("/getconfig")) {
          return new Response(
            JSON.stringify({ ret: 0, typing_ticket: "typing-ticket" }),
            { status: 200 },
          );
        }
        if (typingAttempts++ === 0) return failFirstTypingRequest();
        return new Response(JSON.stringify({ ret: 0 }), { status: 200 });
      });
      const client = new WeixinClient(defaultConfig().weixin, fetchMock);
      const params = {
        session: {
          accountId: "bot",
          token: "token",
          userId: "owner",
          baseUrl: "https://ilinkai.weixin.qq.com",
          savedAt: "now",
        },
        toUserId: "owner",
        contextToken: "ctx",
      };

      await expect(
        client.setTyping({ ...params, typing: true }),
      ).rejects.toThrow();
      await expect(
        client.setTyping({ ...params, typing: false }),
      ).resolves.toBeUndefined();

      expect(
        fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname),
      ).toEqual([
        "/ilink/bot/getconfig",
        "/ilink/bot/sendtyping",
        "/ilink/bot/sendtyping",
      ]);
      expect(
        fetchMock.mock.calls.slice(1).map(([, init]) => {
          const body = JSON.parse(String(init?.body));
          return {
            status: body.status,
            typingTicket: body.typing_ticket,
          };
        }),
      ).toEqual([
        { status: 1, typingTicket: "typing-ticket" },
        { status: 2, typingTicket: "typing-ticket" },
      ]);
    },
  );

  it("refreshes a rejected typing ticket on the next status update", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ret: 0, typing_ticket: "stale-ticket" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ret: -1, errmsg: "ticket expired" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ret: 0, typing_ticket: "fresh-ticket" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ret: 0 }), { status: 200 }),
      );
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);
    const params = {
      session: {
        accountId: "bot",
        token: "token",
        userId: "owner",
        baseUrl: "https://ilinkai.weixin.qq.com",
        savedAt: "now",
      },
      toUserId: "owner",
      contextToken: "ctx",
      typing: true,
    };

    await expect(client.setTyping(params)).rejects.toThrow("ticket expired");
    await expect(client.setTyping(params)).resolves.toBeUndefined();

    expect(
      fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname),
    ).toEqual([
      "/ilink/bot/getconfig",
      "/ilink/bot/sendtyping",
      "/ilink/bot/getconfig",
      "/ilink/bot/sendtyping",
    ]);
    expect(
      JSON.parse(String(fetchMock.mock.calls[3][1]?.body)).typing_ticket,
    ).toBe("fresh-ticket");
  });

  it("does not send a late typing start after its ticket request is cancelled", async () => {
    let resolveConfig!: (response: Response) => void;
    const configPending = new Promise<Response>((resolve) => {
      resolveConfig = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => configPending)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ret: 0 }), { status: 200 }),
      );
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);
    const controller = new AbortController();

    const starting = client.setTyping({
      session: {
        accountId: "bot",
        token: "token",
        userId: "owner",
        baseUrl: "https://ilinkai.weixin.qq.com",
        savedAt: "now",
      },
      toUserId: "owner",
      contextToken: "ctx",
      typing: true,
      signal: controller.signal,
    } as Parameters<WeixinClient["setTyping"]>[0] & {
      signal: AbortSignal;
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();
    resolveConfig(
      new Response(
        JSON.stringify({ ret: 0, typing_ticket: "late-ticket" }),
        { status: 200 },
      ),
    );

    await expect(starting).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves sendmessage ret and errcode on the thrown error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ ret: -2, errcode: -14, errmsg: "busy" }),
        { status: 200 },
      ),
    );
    const client = new WeixinClient(defaultConfig().weixin, fetchMock);

    const sending = client.sendText({
      session: {
        accountId: "bot",
        token: "token",
        userId: "owner",
        baseUrl: "https://ilinkai.weixin.qq.com",
        savedAt: "now",
      },
      toUserId: "owner",
      contextToken: "ctx",
      text: "done",
    });

    await expect(sending).rejects.toMatchObject({
      ret: -2,
      errcode: -14,
      errorCode: -2,
    });
  });
});
