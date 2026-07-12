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
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.msg).toMatchObject({
      from_user_id: "",
      to_user_id: "owner",
      message_type: 2,
      message_state: 2,
      context_token: "ctx",
    });
    expect(body.msg.item_list[0].text_item.text).toBe("done");
    expect(body.base_info.bot_agent).toBe("CodeLink/0.1.0");
  });
});
