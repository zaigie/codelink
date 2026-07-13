import fs from "node:fs";
import readline from "node:readline/promises";

import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";

import { delay } from "../delay.js";
import { StateStore, WeixinSession } from "../state.js";
import { WeixinClient } from "./client.js";

const LOGIN_POLL_DELAY_MS = 1_000;

export type LoginProgress = {
  qrPath: string;
  qrContent: string;
};

export type QrOutput = "png" | "terminal" | "both";

export async function loginWithQr(params: {
  client: WeixinClient;
  store: StateStore;
  timeoutMs?: number;
  legacyGet?: boolean;
  qrOutput?: QrOutput;
  onQr?: (progress: LoginProgress) => void | Promise<void>;
}): Promise<WeixinSession> {
  const existing = params.store.loadSession();
  const qrPath = params.store.path("login-qr.png");
  params.store.ensure();

  const requestQr = () =>
    params.legacyGet
      ? params.client.getQrCodeLegacy()
      : params.client.getQrCode(existing?.token ? [existing.token] : []);
  const publishQr = async (qrContent: string) => {
    await QRCode.toFile(qrPath, qrContent, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
    });
    try {
      fs.chmodSync(qrPath, 0o600);
    } catch {
      // Best effort only.
    }

    const qrOutput = params.qrOutput ?? "both";
    if (qrOutput === "terminal" || qrOutput === "both") {
      qrcodeTerminal.generate(qrContent, { small: true });
    }
    process.stdout.write(`\n二维码文件：${qrPath}\n`);
    process.stdout.write(
      `登录协议：${params.legacyGet ? "legacy GET" : "official POST"}\n`,
    );
    process.stdout.write("请扫描上方二维码；Codex 安装时应直接展示 PNG 图片。\n\n");
    await params.onQr?.({ qrPath, qrContent });
  };

  let qr = await requestQr();
  await publishQr(qr.qrcode_img_content);

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
      // AbortError 是 35 秒长轮询的正常到期，立即重试；其余失败退避后重试。
      if (error instanceof Error && error.name === "AbortError") continue;
      process.stderr.write(
        `二维码状态查询失败，将重试：${String(error)}\n`,
      );
      await delay(LOGIN_POLL_DELAY_MS);
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
        if (session.userId) {
          const allowedUserIds = config.security.allowedUserIds;
          const previousOwnerWasDefault =
            Boolean(existing?.userId) &&
            allowedUserIds.length === 1 &&
            allowedUserIds[0] === existing?.userId;
          if (previousOwnerWasDefault && allowedUserIds[0] !== session.userId) {
            config.security.allowedUserIds = [session.userId];
            params.store.saveConfig(config);
          } else if (!allowedUserIds.includes(session.userId)) {
            allowedUserIds.push(session.userId);
            params.store.saveConfig(config);
          }
        }
        removeQrFile(qrPath);
        process.stdout.write("登录成功。\n");
        const credentialProtection =
          process.platform === "win32"
            ? "当前用户配置目录"
            : "权限 0600";
        process.stdout.write(
          `凭证已保存：${params.store.path("weixin-session.json")}（${credentialProtection}）\n`,
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
          removeQrFile(qrPath);
          process.stdout.write("该微信 Bot 已绑定，继续使用本地已有凭证。\n");
          return existing;
        }
        throw new Error("微信返回已绑定状态，但本地没有可复用的凭证");
      case "expired":
        process.stdout.write("二维码已过期，正在自动刷新。\n");
        qr = await requestQr();
        currentBaseUrl = undefined;
        verifyCode = undefined;
        await publishQr(qr.qrcode_img_content);
        // 刷新后同样退避：服务端若对新码持续返回 expired，不应形成
        // 高频拉码 + 反复写 PNG 的无退避热循环。
        await delay(LOGIN_POLL_DELAY_MS);
        continue;
      case "verify_code_blocked":
        throw new Error("配对码验证被暂时阻止，请稍后重新登录");
    }
    await delay(LOGIN_POLL_DELAY_MS);
  }

  removeQrFile(qrPath);
  throw new Error("等待扫码超时，请重新运行登录命令获取新二维码");
}

function removeQrFile(qrPath: string): void {
  try {
    fs.rmSync(qrPath, { force: true });
  } catch {
    // Best effort cleanup of the short-lived login artifact.
  }
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

