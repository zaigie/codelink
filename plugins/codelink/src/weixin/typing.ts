import type { WeixinSession } from "../state.js";
import { WeixinApiError, type WeixinClient } from "./client.js";

const TYPING_KEEPALIVE_MS = 5_000;
const TYPING_FAILURE_RETRY_MS = 60_000;
const TYPING_CANCEL_TIMEOUT_MS = 3_000;
const MAX_CONSECUTIVE_TYPING_FAILURES = 2;

type TypingTarget = {
  session: WeixinSession;
  toUserId: string;
  contextToken?: string;
};

type TypingActivity = {
  target: TypingTarget;
  references: number;
  updates: Promise<void>;
  keepalive?: NodeJS.Timeout;
  controller?: AbortController;
  closing?: Promise<void>;
  consecutiveFailures: number;
  closed: boolean;
};

export class WeixinTypingIndicator {
  private readonly activities = new Map<string, TypingActivity>();
  private stopped = false;
  private stopPromise?: Promise<void>;

  constructor(
    private readonly client: {
      setTyping?: WeixinClient["setTyping"];
    },
  ) {}

  async during<T>(target: TypingTarget, work: () => Promise<T>): Promise<T> {
    if (this.stopped) return work();
    const [key, activity] = this.acquire(target);
    try {
      return await work();
    } finally {
      await this.release(key, activity);
    }
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopped = true;
    const cancellations = [...this.activities.values()].map(
      async (activity) => {
        activity.closed = true;
        activity.references = 0;
        await this.closeActivity(activity);
      },
    );
    this.activities.clear();
    this.stopPromise = Promise.all(cancellations).then(() => undefined);
    return this.stopPromise;
  }

  private acquire(target: TypingTarget): [string, TypingActivity] {
    const key = JSON.stringify([
      target.session.baseUrl,
      target.session.accountId,
      target.toUserId,
    ]);
    const existing = this.activities.get(key);
    if (existing && !existing.closing && !existing.closed) {
      existing.references += 1;
      existing.target = target;
      if (!existing.controller) this.start(existing);
      else if (
        existing.consecutiveFailures >=
          MAX_CONSECUTIVE_TYPING_FAILURES &&
        existing.keepalive
      ) {
        clearTimeout(existing.keepalive);
        existing.keepalive = undefined;
        void this.pulse(existing, existing.controller.signal);
      }
      return [key, existing];
    }

    const activity: TypingActivity = {
      target,
      references: 1,
      updates: existing?.closing?.then(() => undefined) ?? Promise.resolve(),
      consecutiveFailures: 0,
      closed: false,
    };
    this.activities.set(key, activity);
    this.start(activity);
    return [key, activity];
  }

  private start(activity: TypingActivity): void {
    activity.consecutiveFailures = 0;
    activity.controller = new AbortController();
    const signal = activity.controller.signal;
    void this.pulse(activity, signal);
  }

  private async pulse(
    activity: TypingActivity,
    signal: AbortSignal,
  ): Promise<void> {
    const succeeded = await this.update(
      activity,
      true,
      signal,
      activity.consecutiveFailures < MAX_CONSECUTIVE_TYPING_FAILURES,
    );
    if (
      signal.aborted ||
      activity.closed ||
      activity.controller?.signal !== signal
    ) {
      return;
    }
    activity.consecutiveFailures = succeeded
      ? 0
      : activity.consecutiveFailures + 1;
    const retryDelay =
      activity.consecutiveFailures >= MAX_CONSECUTIVE_TYPING_FAILURES
        ? TYPING_FAILURE_RETRY_MS
        : TYPING_KEEPALIVE_MS;
    activity.keepalive = setTimeout(() => {
      activity.keepalive = undefined;
      void this.pulse(activity, signal);
    }, retryDelay);
    activity.keepalive.unref();
  }

  private async release(key: string, activity: TypingActivity): Promise<void> {
    if (activity.closed) return;
    activity.references = Math.max(0, activity.references - 1);
    if (activity.references > 0) return;
    await this.closeActivity(activity);
    if (
      activity.references === 0 &&
      this.activities.get(key) === activity
    ) {
      this.activities.delete(key);
    }
  }

  private closeActivity(activity: TypingActivity): Promise<void> {
    if (activity.closing) return activity.closing;
    activity.controller?.abort();
    activity.controller = undefined;
    if (activity.keepalive) clearTimeout(activity.keepalive);
    activity.keepalive = undefined;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TYPING_CANCEL_TIMEOUT_MS,
    );
    timeout.unref();
    const cancellation = this.update(
      activity,
      false,
      controller.signal,
    ).then(() => undefined);
    const deadline = new Promise<void>((resolve) => {
      if (controller.signal.aborted) resolve();
      else controller.signal.addEventListener("abort", () => resolve(), {
        once: true,
      });
    });
    activity.closing = Promise.race([cancellation, deadline]).finally(() => {
      clearTimeout(timeout);
      controller.abort();
    });
    return activity.closing;
  }

  private update(
    activity: TypingActivity,
    typing: boolean,
    signal?: AbortSignal,
    logErrors = true,
  ): Promise<boolean> {
    const result = activity.updates.then(() =>
      this.setTypingBestEffort(
        activity.target,
        typing,
        signal,
        logErrors,
      ),
    );
    activity.updates = result.then(() => undefined);
    return result;
  }

  private async setTypingBestEffort(
    target: TypingTarget,
    typing: boolean,
    signal?: AbortSignal,
    logErrors = true,
  ): Promise<boolean> {
    if (!this.client.setTyping) return false;
    if (signal?.aborted) return false;
    try {
      await this.client.setTyping({ ...target, typing, signal });
      return true;
    } catch (error) {
      if (signal?.aborted) return false;
      if (logErrors) {
        const errorCode =
          error instanceof WeixinApiError ? error.errorCode : undefined;
        const codeSuffix =
          typeof errorCode === "number" ? `（错误码 ${errorCode}）` : "";
        process.stderr.write(`微信输入状态更新失败${codeSuffix}\n`);
      }
      return false;
    }
  }
}
