import crypto, { randomUUID } from "node:crypto";

import { CodelinkConfig } from "../config.js";
import { WeixinSession } from "../state.js";
import {
  GetUpdatesResponse,
  QrCodeResponse,
  QrStatusResponse,
} from "./types.js";

const REGULAR_TIMEOUT_MS = 15_000;
const LONG_POLL_TIMEOUT_MS = 40_000;

export class WeixinApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
    readonly ret?: number,
    readonly errcode?: number,
  ) {
    super(message);
  }

  get errorCode(): number | undefined {
    if (typeof this.ret === "number" && this.ret !== 0) return this.ret;
    if (typeof this.errcode === "number" && this.errcode !== 0)
      return this.errcode;
    return this.status;
  }
}

export class WeixinClient {
  constructor(
    private readonly config: CodelinkConfig["weixin"],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getQrCode(localTokens: string[] = []): Promise<QrCodeResponse> {
    return this.request<QrCodeResponse>(
      this.config.baseUrl,
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(this.config.botType)}`,
      {
        method: "POST",
        body: JSON.stringify({ local_token_list: localTokens.slice(-10) }),
      },
    );
  }

  async getQrCodeLegacy(): Promise<QrCodeResponse> {
    return this.legacyGet<QrCodeResponse>(
      this.config.baseUrl,
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(this.config.botType)}`,
      {},
    );
  }

  async getQrStatusLegacy(
    qrcode: string,
    baseUrl = this.config.baseUrl,
    verifyCode?: string,
  ): Promise<QrStatusResponse> {
    const query = new URLSearchParams({ qrcode });
    if (verifyCode) query.set("verify_code", verifyCode);
    return this.legacyGet<QrStatusResponse>(
      baseUrl,
      `ilink/bot/get_qrcode_status?${query.toString()}`,
      { "iLink-App-ClientVersion": "1" },
      35_000,
    );
  }

  async getQrStatus(
    qrcode: string,
    baseUrl = this.config.baseUrl,
    verifyCode?: string,
  ): Promise<QrStatusResponse> {
    const query = new URLSearchParams({ qrcode });
    if (verifyCode) query.set("verify_code", verifyCode);
    return this.request<QrStatusResponse>(
      baseUrl,
      `ilink/bot/get_qrcode_status?${query.toString()}`,
      {
        method: "GET",
        timeoutMs: 35_000,
      },
    );
  }

  async getUpdates(
    session: WeixinSession,
    cursor: string,
    timeoutMs = LONG_POLL_TIMEOUT_MS,
  ): Promise<GetUpdatesResponse> {
    return this.request<GetUpdatesResponse>(
      session.baseUrl,
      "ilink/bot/getupdates",
      {
        method: "POST",
        token: session.token,
        timeoutMs,
        body: JSON.stringify({
          get_updates_buf: cursor,
          base_info: this.baseInfo(),
        }),
      },
    );
  }

  async sendText(params: {
    session: WeixinSession;
    toUserId: string;
    contextToken: string;
    text: string;
    clientId?: string;
  }): Promise<void> {
    const response = await this.request<{
      ret?: number;
      errcode?: number;
      errmsg?: string;
    }>(
      params.session.baseUrl,
      "ilink/bot/sendmessage",
      {
        method: "POST",
        token: params.session.token,
        body: JSON.stringify({
          msg: {
            from_user_id: "",
            to_user_id: params.toUserId,
            client_id: params.clientId ?? `codelink-${randomUUID()}`,
            message_type: 2,
            message_state: 2,
            context_token: params.contextToken,
            item_list: [{ type: 1, text_item: { text: params.text } }],
          },
          base_info: this.baseInfo(),
        }),
      },
    );
    const failedRet = typeof response.ret === "number" && response.ret !== 0;
    const failedErrcode =
      typeof response.errcode === "number" && response.errcode !== 0;
    if (failedRet || failedErrcode) {
      const codes = [
        failedRet ? `ret=${response.ret}` : "",
        failedErrcode ? `errcode=${response.errcode}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      throw new WeixinApiError(
        `sendmessage ${codes}: ${response.errmsg ?? "unknown error"}`,
        undefined,
        JSON.stringify(response),
        response.ret,
        response.errcode,
      );
    }
  }

  private baseInfo(): { channel_version: string; bot_agent: string } {
    return {
      channel_version: this.config.channelVersion,
      bot_agent: this.config.botAgent,
    };
  }

  private headers(token?: string): Record<string, string> {
    const randomUin = crypto.randomBytes(4).readUInt32BE(0);
    const [major = 0, minor = 0, patch = 0] = this.config.channelVersion
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
    const clientVersion =
      ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff);
    return {
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      "X-WECHAT-UIN": Buffer.from(String(randomUin), "utf8").toString("base64"),
      "iLink-App-Id": "bot",
      "iLink-App-ClientVersion": String(clientVersion),
      ...(this.config.routeTag ? { SKRouteTag: this.config.routeTag } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async request<T>(
    baseUrl: string,
    endpoint: string,
    options: {
      method: "GET" | "POST";
      token?: string;
      body?: string;
      timeoutMs?: number;
    },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? REGULAR_TIMEOUT_MS,
    );
    const url = new URL(
      endpoint,
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    );
    try {
      const response = await this.fetchImpl(url, {
        method: options.method,
        headers: this.headers(options.token),
        body: options.body,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new WeixinApiError(
          `${options.method} ${url.pathname} failed with HTTP ${response.status}`,
          response.status,
          text,
        );
      }
      try {
        return JSON.parse(text) as T;
      } catch (error) {
        throw new WeixinApiError(
          `Invalid JSON from ${url.pathname}: ${String(error)}`,
          response.status,
          text.slice(0, 500),
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async legacyGet<T>(
    baseUrl: string,
    endpoint: string,
    headers: Record<string, string>,
    timeoutMs = REGULAR_TIMEOUT_MS,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = new URL(
      endpoint,
      baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    );
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new WeixinApiError(
          `GET ${url.pathname} failed with HTTP ${response.status}`,
          response.status,
          text,
        );
      }
      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
