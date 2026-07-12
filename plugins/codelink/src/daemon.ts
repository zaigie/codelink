import http, { IncomingMessage, ServerResponse } from "node:http";

import { CodelinkConfig } from "./config.js";
import { RunTaskInput, TaskRunner } from "./codex-task-runner.js";
import { StateStore, WeixinSession } from "./state.js";
import { WeixinClient } from "./weixin/client.js";
import { WeixinMessage } from "./weixin/types.js";

type DaemonStatus = {
  ok: boolean;
  accountId?: string;
  ownerUserId?: string;
  allowedUserIds: string[];
  hasDefaultContextToken: boolean;
  recentTasks: number;
};

export class CodelinkDaemon {
  private readonly server: http.Server;
  private stopping = false;
  private pollingStartedAt?: string;

  constructor(
    private readonly config: CodelinkConfig,
    private readonly store: StateStore,
    private readonly client: WeixinClient,
    private readonly taskRunner: TaskRunner,
  ) {
    this.server = http.createServer((request, response) => {
      void this.handleHttp(request, response);
    });
  }

  async start(): Promise<void> {
    const session = this.requireSession();
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.config.daemon.port, this.config.daemon.host, () =>
        resolve(),
      );
    });
    process.stderr.write(
      `CodeLink daemon API: http://${this.config.daemon.host}:${this.config.daemon.port}\n`,
    );
    process.stderr.write(`WeChat account: ${session.accountId}\n`);
    this.pollingStartedAt = new Date().toISOString();
    await this.poll(session);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async poll(session: WeixinSession): Promise<void> {
    let cursor = this.store.loadSyncCursor();
    while (!this.stopping) {
      try {
        const updates = await this.client.getUpdates(session, cursor);
        if (updates.errcode === -14) {
          throw new Error("微信 bot token 已过期，请重新运行 codelink login");
        }
        if (updates.ret && updates.ret !== 0) {
          throw new Error(
            `getupdates ret=${updates.ret}: ${updates.errmsg ?? "unknown"}`,
          );
        }
        if (typeof updates.get_updates_buf === "string") {
          cursor = updates.get_updates_buf;
          this.store.saveSyncCursor(cursor);
        }
        for (const message of updates.msgs ?? []) {
          await this.processIncoming(session, message);
        }
      } catch (error) {
        process.stderr.write(
          `微信轮询错误：${error instanceof Error ? error.message : String(error)}\n`,
        );
        if (!this.stopping) await delay(2_000);
      }
    }
  }

  private async processIncoming(
    session: WeixinSession,
    message: WeixinMessage,
  ): Promise<void> {
    if (message.message_type !== undefined && message.message_type !== 1)
      return;
    const fromUserId = message.from_user_id?.trim();
    if (!fromUserId) return;
    const text = (message.item_list ?? [])
      .filter((item) => item.type === 1)
      .map((item) => item.text_item?.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n");
    if (!text) return;
    if (message.context_token)
      this.store.saveContextToken(fromUserId, message.context_token);

    const allowed = new Set(
      this.config.security.allowedUserIds.length > 0
        ? this.config.security.allowedUserIds
        : session.userId
          ? [session.userId]
          : [],
    );
    if (!allowed.has(fromUserId)) {
      process.stderr.write(`忽略未授权微信用户：${fromUserId}\n`);
      return;
    }

    const messageId = String(
      message.message_id ??
        message.seq ??
        `${fromUserId}-${message.create_time_ms ?? Date.now()}`,
    );
    if (this.store.findTask(messageId)) return;
    const contextToken =
      message.context_token ||
      this.store.getContextToken(fromUserId)?.contextToken;

    if (text === "/status") {
      if (contextToken)
        await this.client.sendText({
          session,
          toUserId: fromUserId,
          contextToken,
          text: this.renderStatus(),
        });
      return;
    }
    if (text === "/help") {
      if (contextToken) {
        await this.client.sendText({
          session,
          toUserId: fromUserId,
          contextToken,
          text: "CodeLink：直接发送文字即可创建一个独立 Codex 任务。命令：/status、/help。",
        });
      }
      return;
    }

    if (contextToken) {
      await this.client.sendText({
        session,
        toUserId: fromUserId,
        contextToken,
        text: `已收到，正在创建独立 Codex 任务（消息 ${messageId}）。`,
      });
    }

    const input: RunTaskInput = { messageId, fromUserId, prompt: text };
    try {
      const result = await this.taskRunner.runNewTask(input);
      if (contextToken) {
        await this.sendChunks(
          session,
          fromUserId,
          contextToken,
          `任务已完成\nThread: ${result.threadId}\n\n${result.finalResponse}`,
        );
      }
    } catch (error) {
      if (contextToken) {
        await this.sendChunks(
          session,
          fromUserId,
          contextToken,
          `任务执行失败：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async handleHttp(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return this.json(response, 200, this.status());
      }
      if (request.method === "GET" && request.url?.startsWith("/tasks")) {
        return this.json(response, 200, { tasks: this.store.listTasks(20) });
      }
      if (request.method === "POST" && request.url === "/send") {
        const body = await readJsonBody(request);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const userId =
          typeof body.userId === "string" ? body.userId.trim() : "";
        if (!text)
          return this.json(response, 400, {
            ok: false,
            error: "text is required",
          });
        const result = await this.sendNotification(text, userId || undefined);
        return this.json(response, 200, result);
      }
      return this.json(response, 404, { ok: false, error: "not found" });
    } catch (error) {
      return this.json(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private status(): DaemonStatus {
    const session = this.store.loadSession();
    const ownerUserId = session?.userId;
    return {
      ok: Boolean(session && this.pollingStartedAt),
      accountId: session?.accountId,
      ownerUserId,
      allowedUserIds: this.config.security.allowedUserIds,
      hasDefaultContextToken: Boolean(
        ownerUserId && this.store.getContextToken(ownerUserId),
      ),
      recentTasks: this.store.listTasks(500).length,
    };
  }

  private renderStatus(): string {
    const status = this.status();
    return [
      `CodeLink: ${status.ok ? "运行中" : "未就绪"}`,
      `账号: ${status.accountId ?? "未登录"}`,
      `默认通知上下文: ${status.hasDefaultContextToken ? "可用" : "尚未建立"}`,
      `任务记录: ${status.recentTasks}`,
    ].join("\n");
  }

  private async sendNotification(
    text: string,
    explicitUserId?: string,
  ): Promise<{ ok: true; toUserId: string }> {
    const session = this.requireSession();
    const toUserId = explicitUserId || session.userId;
    if (!toUserId)
      throw new Error("没有默认微信用户；请先扫码登录并从微信发送一条消息");
    const allowed = new Set(
      this.config.security.allowedUserIds.length
        ? this.config.security.allowedUserIds
        : ([session.userId].filter(Boolean) as string[]),
    );
    if (!allowed.has(toUserId))
      throw new Error(`用户 ${toUserId} 不在 allowedUserIds 中`);
    const context = this.store.getContextToken(toUserId);
    if (!context)
      throw new Error(
        "没有可用的 context_token；请先从目标微信账号向 CodeLink 发送一条消息",
      );
    await this.sendChunks(session, toUserId, context.contextToken, text);
    return { ok: true, toUserId };
  }

  private async sendChunks(
    session: WeixinSession,
    toUserId: string,
    contextToken: string,
    text: string,
  ): Promise<void> {
    for (const chunk of chunkText(text, 1800)) {
      await this.client.sendText({
        session,
        toUserId,
        contextToken,
        text: chunk,
      });
    }
  }

  private requireSession(): WeixinSession {
    const session = this.store.loadSession();
    if (!session?.token) throw new Error("未登录微信，请先运行 codelink login");
    return session;
  }

  private json(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify(value));
  }
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("request body too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("request body must be an object");
  return value as Record<string, unknown>;
}

function chunkText(text: string, max: number): string[] {
  const normalized = text.trim();
  if (!normalized) return ["（空消息）"];
  const result: string[] = [];
  let rest = normalized;
  while (rest.length > max) {
    let index = rest.lastIndexOf("\n", max);
    if (index < max / 2) index = max;
    result.push(rest.slice(0, index));
    rest = rest.slice(index).replace(/^\s+/, "");
  }
  if (rest) result.push(rest);
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
