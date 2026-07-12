import { StateStore } from "./state.js";

export type DaemonClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  authToken?: string;
  store?: StateStore;
};

export type NotificationRequest = {
  text: string;
  userId?: string;
  threadId?: string;
};

export class DaemonClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly store: StateStore;
  private authToken?: string;

  private static readonly READ_TIMEOUT_MS = 10_000;
  private static readonly SEND_TIMEOUT_MS = 10 * 60_000;

  constructor(options: DaemonClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ??
      process.env.CODELINK_DAEMON_URL ??
      "http://127.0.0.1:18791";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.store = options.store ?? new StateStore();
    this.authToken = options.authToken?.trim() || undefined;
  }

  async status(): Promise<unknown> {
    return this.request(
      "/health",
      { method: "GET" },
      DaemonClient.READ_TIMEOUT_MS,
      true,
    );
  }

  async recentTasks(): Promise<unknown> {
    return this.request(
      "/tasks",
      { method: "GET" },
      DaemonClient.READ_TIMEOUT_MS,
    );
  }

  async send(request: NotificationRequest): Promise<unknown> {
    return this.request(
      "/send",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: request.text,
          ...(request.userId ? { userId: request.userId } : {}),
          ...(request.threadId ? { threadId: request.threadId } : {}),
        }),
      },
      DaemonClient.SEND_TIMEOUT_MS,
    );
  }

  private async request(
    pathname: string,
    init: RequestInit,
    timeoutMs: number,
    returnErrorBody = false,
  ): Promise<unknown> {
    const authToken =
      this.authToken ??
      (this.authToken = this.store.getOrCreateDaemonAuthToken());
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${authToken}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(new URL(pathname, this.baseUrl), {
        ...init,
        headers,
        signal: controller.signal,
      });
      const text = await response.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, error: text || `HTTP ${response.status}` };
      }
      if (!response.ok && !returnErrorBody) {
        const error =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : `HTTP ${response.status}`;
        throw new Error(error);
      }
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("CodeLink daemon 请求超时");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
