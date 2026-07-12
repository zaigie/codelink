import http, { IncomingMessage, ServerResponse } from "node:http";

import { parseNewConversationIntent } from "./conversation-intent.js";
import { CodelinkConfig } from "./config.js";
import {
  RunTaskInput,
  RunTaskResult,
  TaskRunner,
} from "./codex-task-runner.js";
import { isCodexThreadId } from "./codex-thread-id.js";
import {
  ConversationBinding,
  StateStore,
  TaskDeliveryRecord,
  TaskRecord,
  WeixinSession,
} from "./state.js";
import { WeixinClient } from "./weixin/client.js";
import {
  DeliveryReceipt,
  WeixinTextDelivery,
} from "./weixin/delivery.js";
import { WeixinMessage } from "./weixin/types.js";
import { WeixinTypingIndicator } from "./weixin/typing.js";

type DaemonStatus = {
  ok: boolean;
  degraded: boolean;
  sessionExpired: boolean;
  accountId?: string;
  ownerUserId?: string;
  allowedUserIds: string[];
  hasDefaultContextToken: boolean;
  activeThreadId?: string;
  recentTasks: number;
  activeTasks: number;
  pollingStartedAt?: string;
  lastPollSuccessAt?: string;
  lastPollErrorAt?: string;
  lastPollError?: string;
};

class WeixinSessionExpiredError extends Error {}

type PendingThread = {
  messageId: string;
  promise: Promise<ConversationBinding | null>;
  settle(threadId?: string): void;
};

export class CodelinkDaemon {
  private readonly server: http.Server;
  private readonly delivery: WeixinTextDelivery;
  private readonly typing: WeixinTypingIndicator;
  private readonly backgroundTasks = new Set<Promise<void>>();
  private readonly pendingThreads = new Map<string, PendingThread>();
  private stopping = false;
  private pollingStartedAt?: string;
  private lastPollSuccessAt?: string;
  private lastPollErrorAt?: string;
  private lastPollError?: string;
  private degraded = false;
  private sessionExpired = false;

  constructor(
    private readonly config: CodelinkConfig,
    private readonly store: StateStore,
    private readonly client: WeixinClient,
    private readonly taskRunner: TaskRunner,
  ) {
    this.delivery = new WeixinTextDelivery(client);
    this.typing = new WeixinTypingIndicator(client);
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
    process.stderr.write("WeChat session: loaded\n");
    const recovered = this.recoverPendingTasks(session);
    const recoveredDeliveries = this.recoverPendingDeliveries(session);
    if (recovered > 0 || recoveredDeliveries > 0) {
      process.stderr.write(
        `恢复未完成的 CodeLink 任务：${recovered}，待投递消息：${recoveredDeliveries}\n`,
      );
    }
    this.pollingStartedAt = new Date().toISOString();
    await this.poll(session);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    const drained = await this.drainBackgroundTasks(5_000);
    await this.typing.stop();
    if (!drained) {
      process.stderr.write(
        "CodeLink 在 5 秒内未完成全部后台任务；已持久化的任务会在下次启动时按安全恢复策略处理。\n",
      );
    }
  }

  private async poll(session: WeixinSession): Promise<void> {
    let cursor = this.store.loadSyncCursor();
    while (!this.stopping) {
      try {
        cursor = await this.pollOnce(session, cursor);
      } catch (error) {
        process.stderr.write(
          `微信轮询错误：${error instanceof Error ? error.message : String(error)}\n`,
        );
        if (error instanceof WeixinSessionExpiredError) {
          process.stderr.write(
            "微信登录已失效，轮询已暂停；请重新运行 codelink login 后重启 CodeLink 服务。\n",
          );
          return;
        }
        if (!this.stopping) await delay(2_000);
      }
    }
  }

  async pollOnce(session: WeixinSession, cursor: string): Promise<string> {
    try {
      const updates = await this.client.getUpdates(session, cursor);
      if (updates.errcode === -14) {
        throw new WeixinSessionExpiredError(
          "微信 bot token 已过期，请重新运行 codelink login",
        );
      }
      if (updates.errcode && updates.errcode !== 0) {
        throw new Error(
          `getupdates errcode=${updates.errcode}: ${updates.errmsg ?? "unknown"}`,
        );
      }
      if (updates.ret && updates.ret !== 0) {
        throw new Error(
          `getupdates ret=${updates.ret}: ${updates.errmsg ?? "unknown"}`,
        );
      }

      for (const message of updates.msgs ?? []) {
        this.acceptIncomingMessage(session, message);
      }

      const nextCursor =
        typeof updates.get_updates_buf === "string"
          ? updates.get_updates_buf
          : cursor;
      if (nextCursor !== cursor) this.store.saveSyncCursor(nextCursor);
      this.lastPollSuccessAt = new Date().toISOString();
      this.degraded = false;
      this.sessionExpired = false;
      return nextCursor;
    } catch (error) {
      this.degraded = true;
      this.sessionExpired = error instanceof WeixinSessionExpiredError;
      this.lastPollErrorAt = new Date().toISOString();
      this.lastPollError =
        error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async handleIncomingMessage(
    session: WeixinSession,
    message: WeixinMessage,
  ): Promise<void> {
    const completion = this.acceptIncomingMessage(session, message);
    if (completion) await completion;
  }

  private acceptIncomingMessage(
    session: WeixinSession,
    message: WeixinMessage,
  ): Promise<void> | undefined {
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
    if (message.context_token)
      this.store.saveContextToken(fromUserId, message.context_token);

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
      return contextToken
        ? this.trackBackground(
            this.deliverOperationalText(
              session,
              fromUserId,
              contextToken,
              this.renderStatus(),
            ),
          )
        : undefined;
    }
    if (text === "/help") {
      return contextToken
        ? this.trackBackground(
            this.deliverOperationalText(
              session,
              fromUserId,
              contextToken,
              "CodeLink：普通消息继续当前 Codex 会话；没有当前会话时自动新建。发送 /new，或直接说“开个新会话”，即可切换。命令：/status、/help。",
            ),
          )
        : undefined;
    }

    const conversationIntent = parseNewConversationIntent(text);
    if (conversationIntent.startNew) {
      this.store.clearConversation(fromUserId);
      this.pendingThreads.delete(fromUserId);
      if (!conversationIntent.prompt) {
        return contextToken
          ? this.trackBackground(
              this.deliverOperationalText(
                session,
                fromUserId,
                contextToken,
                "新会话已开启，上一个会话的上下文不会带入。直接发送下一条消息即可开始。",
              ),
            )
          : undefined;
      }
    }

    const conversationSnapshot = this.store.getConversationSnapshot(fromUserId);
    const conversationAtReceipt = conversationSnapshot.binding;
    const pendingAtReceipt = conversationIntent.startNew
      ? undefined
      : this.pendingThreads.get(fromUserId);
    const willCreateNewConversation =
      conversationIntent.startNew ||
      (!conversationAtReceipt && !pendingAtReceipt);
    const ownedPending = willCreateNewConversation
      ? this.createPendingThread(fromUserId, messageId)
      : undefined;

    const input: RunTaskInput = {
      messageId,
      fromUserId,
      prompt: conversationIntent.prompt,
      conversationAtReceipt,
      conversationGenerationAtReceipt: conversationSnapshot.generation,
      ...(conversationIntent.startNew ? { startNew: true } : {}),
      ...(ownedPending
        ? { onThreadStarted: (threadId: string) => ownedPending.settle(threadId) }
        : {}),
    };
    const now = new Date().toISOString();
    if (
      !this.store.acceptTask({
        messageId,
        fromUserId,
        prompt: conversationIntent.prompt,
        promptPreview: previewText(conversationIntent.prompt),
        ...(conversationIntent.startNew ? { startNew: true } : {}),
        conversationAtReceipt,
        conversationGenerationAtReceipt: conversationSnapshot.generation,
        status: "accepted",
        startedAt: now,
      })
    ) {
      return;
    }

    const execution = this.executeTask(
      session,
      input,
      contextToken,
      pendingAtReceipt?.promise,
      ownedPending,
    );
    return this.trackBackground(execution);
  }

  recoverPendingTasks(session: WeixinSession): number {
    const records = this.store
      .listTasks(500)
      .reverse()
      .filter((task) => task.status === "accepted" || task.status === "running");
    let recovered = 0;
    for (const record of records) {
      const contextToken = this.store.getContextToken(
        record.fromUserId,
      )?.contextToken;
      if (record.status === "running") {
        this.persistTaskFailure(
          record.messageId,
          `CodeLink 在任务执行期间重启；为避免重复执行可能产生副作用的请求，未自动重放。${record.threadId ? `可继续会话 ${record.threadId}，或重新发送请求。` : "请重新发送请求。"}`,
          contextToken,
        );
        recovered += 1;
        continue;
      }
      if (typeof record.prompt !== "string") {
        this.persistTaskFailure(
          record.messageId,
          "CodeLink 升级前的任务缺少可恢复请求正文，请重新发送",
          contextToken,
        );
        continue;
      }

      let conversationAtReceipt = record.conversationAtReceipt;
      let conversationGenerationAtReceipt =
        record.conversationGenerationAtReceipt ??
        this.store.getConversationSnapshot(record.fromUserId).generation;
      let startNew = record.startNew;
      if (record.threadId) {
        const current = this.store.getConversationSnapshot(record.fromUserId);
        conversationAtReceipt =
          current.binding?.threadId === record.threadId
            ? current.binding
            : {
                threadId: record.threadId,
                updatedAt: new Date().toISOString(),
              };
        conversationGenerationAtReceipt = current.generation;
        startNew = false;
      }
      if (startNew) this.pendingThreads.delete(record.fromUserId);
      const pendingAtReceipt =
        !startNew && !conversationAtReceipt
          ? this.pendingThreads.get(record.fromUserId)
          : undefined;
      const willCreateNewConversation =
        Boolean(startNew) || (!conversationAtReceipt && !pendingAtReceipt);
      const ownedPending = willCreateNewConversation
        ? this.createPendingThread(record.fromUserId, record.messageId)
        : undefined;
      const input: RunTaskInput = {
        messageId: record.messageId,
        fromUserId: record.fromUserId,
        prompt: record.prompt,
        conversationAtReceipt,
        conversationGenerationAtReceipt,
        recover: true,
        ...(startNew ? { startNew: true } : {}),
        ...(ownedPending
          ? {
              onThreadStarted: (threadId: string) =>
                ownedPending.settle(threadId),
            }
          : {}),
      };
      this.trackBackground(
        this.executeTask(
          session,
          input,
          contextToken,
          pendingAtReceipt?.promise,
          ownedPending,
        ),
      );
      recovered += 1;
    }
    return recovered;
  }

  recoverPendingDeliveries(session: WeixinSession): number {
    let recovered = 0;
    for (const task of this.store.listTasks(500).reverse()) {
      if (task.delivery?.acknowledgement?.status === "pending") {
        this.markTaskDeliverySkipped(task.messageId, "acknowledgement");
      }
      const pending = task.delivery?.result;
      if (pending?.status !== "pending") continue;
      const contextToken = this.store.getContextToken(
        task.fromUserId,
      )?.contextToken;
      if (!contextToken || !pending.text) {
        this.store.updateTask(task.messageId, (current) => ({
          ...current,
          delivery: {
            ...current.delivery,
            result: {
              ...current.delivery?.result,
              status: contextToken ? "failed" : "skipped",
              updatedAt: new Date().toISOString(),
              ...(!contextToken
                ? {}
                : { error: "持久化投递记录缺少消息正文" }),
            },
          },
        }));
        continue;
      }
      this.trackBackground(
        this.deliverTaskText(
          task.messageId,
          "result",
          session,
          task.fromUserId,
          contextToken,
          pending.text,
        ),
      );
      recovered += 1;
    }
    return recovered;
  }

  private createPendingThread(
    userId: string,
    messageId: string,
  ): PendingThread {
    let resolve!: (binding: ConversationBinding | null) => void;
    let settled = false;
    const promise = new Promise<ConversationBinding | null>((done) => {
      resolve = done;
    });
    const pending: PendingThread = {
      messageId,
      promise,
      settle: (threadId) => {
        if (settled) return;
        settled = true;
        const current = this.store.getConversation(userId);
        resolve(
          threadId
            ? current?.threadId === threadId
              ? current
              : { threadId, updatedAt: new Date().toISOString() }
            : null,
        );
        if (this.pendingThreads.get(userId) === pending) {
          this.pendingThreads.delete(userId);
        }
      },
    };
    this.pendingThreads.set(userId, pending);
    return pending;
  }

  private executeTask(
    session: WeixinSession,
    input: RunTaskInput,
    contextToken?: string,
    routeAfter?: Promise<ConversationBinding | null>,
    ownedPending?: PendingThread,
  ): Promise<void> {
    const work = () =>
      this.executeTaskWork(
        session,
        input,
        contextToken,
        routeAfter,
        ownedPending,
      );
    return contextToken
      ? this.typing.during(
          {
            session,
            toUserId: input.fromUserId,
            contextToken,
          },
          work,
        )
      : work();
  }

  private async executeTaskWork(
    session: WeixinSession,
    input: RunTaskInput,
    contextToken?: string,
    routeAfter?: Promise<ConversationBinding | null>,
    ownedPending?: PendingThread,
  ): Promise<void> {
    const routedConversation = routeAfter
      ? (await routeAfter) ?? this.store.getConversation(input.fromUserId)
      : input.conversationAtReceipt;
    const routedInput: RunTaskInput = routeAfter
      ? { ...input, conversationAtReceipt: routedConversation }
      : input;
    const runnerInput: RunTaskInput = {
      ...routedInput,
      onResultReady: (readyResult) => {
        routedInput.onResultReady?.(readyResult);
        this.persistTaskResult(
          routedInput.messageId,
          readyResult,
          contextToken,
          routedInput.startNew === true,
        );
      },
      onTaskFailed: (errorMessage) => {
        routedInput.onTaskFailed?.(errorMessage);
        this.persistTaskFailure(
          routedInput.messageId,
          errorMessage,
          contextToken,
        );
      },
    };
    let result: RunTaskResult;
    try {
      result = await this.taskRunner.runTask(runnerInput);
      routedInput.onThreadStarted?.(result.threadId);
      this.persistTaskResult(
        routedInput.messageId,
        result,
        contextToken,
        routedInput.startNew === true,
      );
    } catch (error) {
      ownedPending?.settle();
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.persistTaskFailure(
        routedInput.messageId,
        errorMessage,
        contextToken,
      );
      if (!contextToken) {
        return;
      }
      await this.deliverTaskText(
        routedInput.messageId,
        "result",
        session,
        routedInput.fromUserId,
        contextToken,
        `任务执行失败：${errorMessage}`,
      );
      return;
    }
    if (!contextToken) {
      return;
    }
    await this.deliverTaskText(
      routedInput.messageId,
      "result",
      session,
      routedInput.fromUserId,
      contextToken,
      formatTaskExecutionResult(result, routedInput.startNew === true),
    );
  }

  private persistTaskResult(
    messageId: string,
    result: RunTaskResult,
    contextToken?: string,
    explicitlyStartedNew = false,
  ): void {
    const now = new Date().toISOString();
    this.store.updateTask(messageId, (current) => ({
      ...current,
      threadId: result.threadId,
      ...(result.workspace ? { workspace: result.workspace } : {}),
      prompt: undefined,
      conversationAtReceipt: undefined,
      conversationGenerationAtReceipt: undefined,
      startNew: undefined,
      status: "completed",
      completedAt: now,
      finalResponsePreview: previewText(result.finalResponse),
      delivery: {
        ...current.delivery,
        result: contextToken
          ? {
              status: "pending",
              updatedAt: now,
              text: formatTaskExecutionResult(result, explicitlyStartedNew),
              deliveryKey: taskDeliveryKey(messageId, "result"),
            }
          : { status: "skipped", updatedAt: now },
      },
    }));
  }

  private persistTaskFailure(
    messageId: string,
    errorMessage: string,
    contextToken?: string,
  ): void {
    const now = new Date().toISOString();
    const text = `任务执行失败：${errorMessage}`;
    this.store.updateTask(messageId, (current) => ({
      ...current,
      prompt: undefined,
      conversationAtReceipt: undefined,
      conversationGenerationAtReceipt: undefined,
      startNew: undefined,
      status: "failed",
      completedAt: now,
      error: errorMessage,
      delivery: {
        ...current.delivery,
        result: contextToken
          ? {
              status: "pending",
              updatedAt: now,
              text,
              deliveryKey: taskDeliveryKey(messageId, "result"),
            }
          : { status: "skipped", updatedAt: now },
      },
    }));
  }

  private async deliverTaskText(
    messageId: string,
    stage: "acknowledgement" | "result",
    session: WeixinSession,
    toUserId: string,
    contextToken: string,
    text: string,
  ): Promise<void> {
    const deliveryKey =
      this.store.findTask(messageId)?.delivery?.[stage]?.deliveryKey ??
      taskDeliveryKey(messageId, stage);
    this.store.updateTask(messageId, (current) => ({
      ...current,
      delivery: {
        ...current.delivery,
        [stage]: {
          status: "pending",
          updatedAt: new Date().toISOString(),
          text,
          deliveryKey,
        },
      },
    }));
    try {
      const receipt = await this.delivery.sendText({
        session,
        toUserId,
        contextToken,
        text,
        deliveryKey,
      });
      this.recordTaskDelivery(messageId, stage, receipt);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.store.updateTask(messageId, (current) => ({
        ...current,
        delivery: {
          ...current.delivery,
          [stage]: {
            status: "failed",
            updatedAt: new Date().toISOString(),
            error: errorMessage,
            text,
            deliveryKey,
          },
        },
      }));
      process.stderr.write(
        `微信消息投递失败（任务 ${messageId}，阶段 ${stage}）：${errorMessage}\n`,
      );
    }
  }

  private recordTaskDelivery(
    messageId: string,
    stage: "acknowledgement" | "result",
    receipt: DeliveryReceipt,
  ): void {
    const failed = receipt.sentChunks !== receipt.totalChunks;
    this.store.updateTask(messageId, (current) => {
      const pending = current.delivery?.[stage];
      return {
        ...current,
        delivery: {
          ...current.delivery,
          [stage]: {
            status: failed ? "failed" : "sent",
            updatedAt: new Date().toISOString(),
            totalChunks: receipt.totalChunks,
            sentChunks: receipt.sentChunks,
            ...(receipt.failedChunkIndex !== undefined
              ? { failedChunkIndex: receipt.failedChunkIndex }
              : {}),
            ...(receipt.errorCode !== undefined
              ? { errorCode: receipt.errorCode }
              : {}),
            ...(failed
              ? {
                  error:
                    receipt.error ??
                    `微信投递未完成（${receipt.sentChunks}/${receipt.totalChunks} 段）`,
                  ...(pending?.text ? { text: pending.text } : {}),
                  ...(pending?.deliveryKey
                    ? { deliveryKey: pending.deliveryKey }
                    : {}),
                }
              : {}),
          },
        },
      };
    });
    if (failed) {
      process.stderr.write(
        `微信消息投递未完成（任务 ${messageId}，阶段 ${stage}，已发送 ${receipt.sentChunks}/${receipt.totalChunks} 段）。\n`,
      );
    }
  }

  private markTaskDeliverySkipped(
    messageId: string,
    stage: "acknowledgement" | "result",
  ): void {
    this.store.updateTask(messageId, (current) => ({
      ...current,
      delivery: {
        ...current.delivery,
        [stage]: {
          status: "skipped",
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  }

  private async deliverOperationalText(
    session: WeixinSession,
    toUserId: string,
    contextToken: string,
    text: string,
  ): Promise<void> {
    try {
      const receipt = await this.delivery.sendText({
        session,
        toUserId,
        contextToken,
        text,
      });
      if (receipt.sentChunks !== receipt.totalChunks) {
        process.stderr.write("微信操作消息未能完整投递。\n");
      }
    } catch (error) {
      process.stderr.write(
        `微信操作消息投递失败：${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  private trackBackground(promise: Promise<void>): Promise<void> {
    const tracked = promise.catch((error) => {
      process.stderr.write(
        `CodeLink 后台任务错误：${error instanceof Error ? error.message : String(error)}\n`,
      );
    });
    this.backgroundTasks.add(tracked);
    tracked.then(
      () => this.backgroundTasks.delete(tracked),
      () => this.backgroundTasks.delete(tracked),
    );
    return tracked;
  }

  async waitForIdle(): Promise<void> {
    while (this.backgroundTasks.size > 0) {
      await Promise.all([...this.backgroundTasks]);
    }
  }

  async drainBackgroundTasks(timeoutMs: number): Promise<boolean> {
    if (this.backgroundTasks.size === 0) return true;
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      void this.waitForIdle().then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  private async handleHttp(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      if (request.method === "GET" && request.url === "/health") {
        const status = this.getStatus();
        return this.json(response, status.ok ? 200 : 503, status);
      }
      if (request.method === "GET" && request.url === "/healthz") {
        const status = this.getStatus();
        return this.json(response, status.ok ? 200 : 503, {
          service: "codelink",
          ok: status.ok,
          degraded: status.degraded,
          sessionExpired: status.sessionExpired,
        });
      }
      if (request.method === "GET" && request.url?.startsWith("/tasks")) {
        return this.json(response, 200, { tasks: this.getRecentTasks() });
      }
      if (request.method === "POST" && request.url === "/send") {
        const body = await readJsonBody(request);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const userId =
          typeof body.userId === "string" ? body.userId.trim() : "";
        const threadId =
          typeof body.threadId === "string" ? body.threadId.trim() : "";
        if (!text)
          return this.json(response, 400, {
            ok: false,
            error: "text is required",
          });
        const result = await this.sendNotification(
          text,
          userId || undefined,
          threadId || undefined,
        );
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

  getStatus(): DaemonStatus {
    const session = this.store.loadSession();
    const ownerUserId = session?.userId;
    const activeThreadId = ownerUserId
      ? this.store.getConversation(ownerUserId)?.threadId
      : undefined;
    return {
      ok: Boolean(session && this.lastPollSuccessAt && !this.degraded),
      degraded: this.degraded,
      sessionExpired: this.sessionExpired,
      accountId: session?.accountId,
      ownerUserId,
      allowedUserIds: this.config.security.allowedUserIds,
      hasDefaultContextToken: Boolean(
        ownerUserId && this.store.getContextToken(ownerUserId),
      ),
      ...(activeThreadId ? { activeThreadId } : {}),
      recentTasks: this.store.listTasks(500).length,
      activeTasks: this.backgroundTasks.size,
      ...(this.pollingStartedAt
        ? { pollingStartedAt: this.pollingStartedAt }
        : {}),
      ...(this.lastPollSuccessAt
        ? { lastPollSuccessAt: this.lastPollSuccessAt }
        : {}),
      ...(this.lastPollErrorAt
        ? { lastPollErrorAt: this.lastPollErrorAt }
        : {}),
      ...(this.lastPollError ? { lastPollError: this.lastPollError } : {}),
    };
  }

  private renderStatus(): string {
    const status = this.getStatus();
    return [
      `CodeLink: ${status.ok ? "运行中" : status.sessionExpired ? "微信登录已失效" : status.degraded ? "轮询异常" : "未就绪"}`,
      `账号: ${status.accountId ?? "未登录"}`,
      `默认通知上下文: ${status.hasDefaultContextToken ? "可用" : "尚未建立"}`,
      `当前 Codex 会话: ${status.activeThreadId ?? "尚未绑定"}`,
      `后台任务: ${status.activeTasks}`,
      `任务记录: ${status.recentTasks}`,
    ].join("\n");
  }

  getRecentTasks(limit = 20): unknown[] {
    return this.store.listTasks(limit).map(toPublicTaskRecord);
  }

  async sendNotification(
    text: string,
    explicitUserId?: string,
    requestedThreadId?: string,
  ): Promise<{
    ok: true;
    toUserId: string;
    conversationBound: boolean;
    threadId?: string;
  }> {
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
    const threadId = isCodexThreadId(requestedThreadId)
      ? requestedThreadId
      : undefined;
    const previousBinding = this.store.getConversation(toUserId);
    if (threadId) this.store.bindConversation(toUserId, { threadId });
    const notificationBinding = threadId
      ? this.store.getConversation(toUserId)
      : null;
    try {
      const receipt = await this.delivery.sendText({
        session,
        toUserId,
        contextToken: context.contextToken,
        text: formatTaskNotification(text, Boolean(threadId)),
      });
      if (receipt.sentChunks !== receipt.totalChunks) {
        throw new Error(
          receipt.error ??
            `微信通知未完整投递（已发送 ${receipt.sentChunks} 段）`,
        );
      }
    } catch (error) {
      if (threadId && notificationBinding) {
        this.store.replaceConversationIfUnchanged(
          toUserId,
          notificationBinding,
          previousBinding,
        );
      }
      throw error;
    }
    return {
      ok: true,
      toUserId,
      conversationBound: Boolean(threadId),
      ...(threadId ? { threadId } : {}),
    };
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

function formatTaskNotification(text: string, conversationBound: boolean) {
  const footer = conversationBound
    ? "—— CodeLink 任务通知\n此任务已设为微信当前 Codex 会话；可直接回复继续，发送 /new 或直接说“开个新会话”开始新会话。"
    : "—— CodeLink 任务通知\n本通知未切换当前 Codex 会话；回复将继续此前已绑定的会话（如有），发送 /new 开始新会话。";
  return `${text.trim()}\n\n${footer}`;
}

function previewText(value: string, max = 500): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 1)}…`;
}

function toPublicTaskRecord(task: TaskRecord): Record<string, unknown> {
  const {
    prompt: _prompt,
    conversationAtReceipt: _conversationAtReceipt,
    conversationGenerationAtReceipt: _conversationGenerationAtReceipt,
    startNew: _startNew,
    delivery,
    ...visible
  } = task;
  return {
    ...visible,
    ...(delivery
      ? {
          delivery: {
            ...(delivery.acknowledgement
              ? {
                  acknowledgement: toPublicDeliveryRecord(
                    delivery.acknowledgement,
                  ),
                }
              : {}),
            ...(delivery.result
              ? { result: toPublicDeliveryRecord(delivery.result) }
              : {}),
          },
        }
      : {}),
  };
}

function toPublicDeliveryRecord(
  delivery: TaskDeliveryRecord,
): Record<string, unknown> {
  const { text: _text, deliveryKey: _deliveryKey, ...visible } = delivery;
  return visible;
}

function formatTaskExecutionResult(
  result: RunTaskResult,
  explicitlyStartedNew = false,
): string {
  return explicitlyStartedNew
    ? `新会话已开启，上一个会话的上下文不会带入。\n\n${result.finalResponse}`
    : result.finalResponse;
}

function taskDeliveryKey(
  messageId: string,
  stage: "acknowledgement" | "result",
): string {
  return `task:${messageId}:${stage}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
