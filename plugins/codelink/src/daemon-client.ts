export type DaemonClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export class DaemonClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DaemonClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ??
      process.env.CODELINK_DAEMON_URL ??
      "http://127.0.0.1:18791";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async status(): Promise<unknown> {
    return this.request("/health", { method: "GET" });
  }

  async recentTasks(): Promise<unknown> {
    return this.request("/tasks", { method: "GET" });
  }

  async send(text: string, userId?: string): Promise<unknown> {
    return this.request("/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(userId ? { userId } : {}) }),
    });
  }

  private async request(pathname: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetchImpl(new URL(pathname, this.baseUrl), {
        ...init,
        signal: controller.signal,
      });
      const text = await response.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = { ok: false, error: text || `HTTP ${response.status}` };
      }
      if (!response.ok) {
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
