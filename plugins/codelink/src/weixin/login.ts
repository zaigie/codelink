import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";

import { StateStore, WeixinSession } from "../state.js";
import { WeixinClient } from "./client.js";

export type LoginProgress = {
  qrPath: string;
  qrContent: string;
};

export async function loginWithQr(params: {
  client: WeixinClient;
  store: StateStore;
  timeoutMs?: number;
  legacyGet?: boolean;
  onQr?: (progress: LoginProgress) => void | Promise<void>;
}): Promise<WeixinSession> {
  const existing = params.store.loadSession();
  const qr = params.legacyGet
    ? await params.client.getQrCodeLegacy()
    : await params.client.getQrCode(existing?.token ? [existing.token] : []);
  const qrPath = params.store.path("login-qr.png");
  params.store.ensure();
  await QRCode.toFile(qrPath, qr.qrcode_img_content, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
  try {
    fs.chmodSync(qrPath, 0o600);
  } catch {
    // Best effort only.
  }

  qrcodeTerminal.generate(qr.qrcode_img_content, { small: true });
  process.stdout.write(`\n二维码文件：${qrPath}\n`);
  process.stdout.write(
    `登录协议：${params.legacyGet ? "legacy GET" : "official POST"}\n`,
  );
  process.stdout.write(`备用链接：${qr.qrcode_img_content}\n\n`);
  await params.onQr?.({ qrPath, qrContent: qr.qrcode_img_content });

  const timeoutMs = params.timeoutMs ?? 8 * 60_000;
  const deadline = Date.now() + timeoutMs;
  let currentBaseUrl: string | undefined;
  let verifyCode: string | undefined;

  while (Date.now() < deadline) {
    let status;
    try {
      status = params.legacyGet
        ? await params.client.getQrStatusLegacy(
            qr.qrcode,
            currentBaseUrl,
            verifyCode,
          )
        : await params.client.getQrStatus(
            qr.qrcode,
            currentBaseUrl,
            verifyCode,
          );
      verifyCode = undefined;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") continue;
      process.stderr.write(`二维码状态查询失败，将重试：${String(error)}\n`);
      continue;
    }

    switch (status.status) {
      case "wait":
        break;
      case "scaned":
        process.stdout.write("已扫码，请在微信中确认。\n");
        break;
      case "need_verifycode": {
        const input = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        try {
          verifyCode = (
            await input.question("微信要求配对码，请输入手机上显示的数字：")
          ).trim();
        } finally {
          input.close();
        }
        break;
      }
      case "scaned_but_redirect":
        if (status.redirect_host) {
          currentBaseUrl = status.redirect_host.startsWith("http")
            ? status.redirect_host
            : `https://${status.redirect_host}`;
          process.stdout.write(`登录请求已切换到微信网关：${currentBaseUrl}\n`);
        }
        break;
      case "confirmed": {
        if (!status.bot_token || !status.ilink_bot_id) {
          throw new Error("微信确认成功，但响应缺少 bot_token 或 ilink_bot_id");
        }
        const session: WeixinSession = {
          accountId: normalizeAccountId(status.ilink_bot_id),
          token: status.bot_token,
          userId: status.ilink_user_id,
          baseUrl: normalizeBaseUrl(
            status.baseurl || currentBaseUrl || "https://ilinkai.weixin.qq.com",
          ),
          savedAt: new Date().toISOString(),
        };
        params.store.saveSession(session);
        const config = params.store.loadConfig();
        if (session.userId && config.security.allowedUserIds.length === 0) {
          config.security.allowedUserIds = [session.userId];
          params.store.saveConfig(config);
        }
        process.stdout.write(`登录成功，账号：${session.accountId}\n`);
        process.stdout.write(
          `凭证已保存：${params.store.path("weixin-session.json")}（权限 0600）\n`,
        );
        process.stdout.write(
          `同步游标：${params.store.path("get-updates.json")}\n`,
        );
        process.stdout.write(
          `会话上下文：${params.store.path("context-tokens.json")}\n`,
        );
        return session;
      }
      case "binded_redirect":
        if (existing) {
          process.stdout.write("该微信 Bot 已绑定，继续使用本地已有凭证。\n");
          return existing;
        }
        throw new Error("微信返回已绑定状态，但本地没有可复用的凭证");
      case "expired":
        throw new Error("二维码已过期，请重新运行 codelink login");
      case "verify_code_blocked":
        throw new Error("配对码验证被暂时阻止，请稍后重新登录");
    }
  }

  throw new Error(`等待扫码超时；二维码保留在 ${path.resolve(qrPath)}`);
}

function normalizeAccountId(value: string): string {
  return value
    .trim()
    .replaceAll("@", "-")
    .replaceAll(".", "-")
    .replace(/[^A-Za-z0-9_-]/g, "-");
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "https://ilinkai.weixin.qq.com";
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;
}
