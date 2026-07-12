import fs from "node:fs";
import path from "node:path";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

import { ApprovalPolicy, SandboxMode } from "./config.js";

export type AppServerRunOptions = {
  cwd: string;
  sandboxMode: SandboxMode;
  approvalPolicy: ApprovalPolicy;
  networkAccessEnabled: boolean;
  model?: string;
  developerInstructions?: string;
  onThreadStarted?: (thread: { threadId: string; cwd?: string }) => void;
};

export type AppServerRunResult = {
  threadId: string;
  /** Present for the stdio adapter; optional for lightweight test adapters. */
  turnId?: string;
  finalResponse: string;
  cwd?: string;
};

export type StdioAppServerRunResult = AppServerRunResult & { turnId: string };

export type StdioCodexAppServerOptions = {
  requestTimeoutMs?: number;
  turnTimeoutMs?: number;
};

export interface CodexAppServer {
  runNewThread(
    options: AppServerRunOptions,
    prompt: string,
  ): Promise<AppServerRunResult>;
  continueThread(
    options: AppServerRunOptions,
    threadId: string,
    prompt: string,
  ): Promise<AppServerRunResult>;
}

type RpcResponse = {
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
  method?: string;
  params?: unknown;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
};

type TurnCompletion = {
  finalResponse: string;
  fallbackResponse: string;
};

export class StdioCodexAppServer implements CodexAppServer {
  private readonly requestTimeoutMs: number;
  private readonly turnTimeoutMs: number;

  constructor(
    private readonly codexBin = resolveCodexBin(),
    options: StdioCodexAppServerOptions = {},
  ) {
    this.requestTimeoutMs = normalizeTimeout(
      options.requestTimeoutMs,
      30_000,
      "requestTimeoutMs",
    );
    this.turnTimeoutMs = normalizeTimeout(
      options.turnTimeoutMs,
      30 * 60_000,
      "turnTimeoutMs",
    );
  }

  async runNewThread(
    options: AppServerRunOptions,
    prompt: string,
  ): Promise<StdioAppServerRunResult> {
    return this.run(options, prompt);
  }

  async continueThread(
    options: AppServerRunOptions,
    threadId: string,
    prompt: string,
  ): Promise<StdioAppServerRunResult> {
    return this.run(options, prompt, threadId);
  }

  private async run(
    options: AppServerRunOptions,
    prompt: string,
    existingThreadId?: string,
  ): Promise<StdioAppServerRunResult> {
    const usesShellShim = /\.(?:cmd|bat)$/i.test(this.codexBin);
    const executable = usesShellShim
      ? `"${this.codexBin.replaceAll('"', '\\"')}"`
      : this.codexBin;
    const child = usesShellShim
      ? spawn(`${executable} app-server --listen stdio://`, {
          cwd: options.cwd,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
        })
      : spawn(executable, ["app-server", "--listen", "stdio://"], {
          cwd: options.cwd,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });
    const session = new AppServerSession(
      child,
      this.requestTimeoutMs,
      this.turnTimeoutMs,
    );

    try {
      await session.request("initialize", {
        clientInfo: {
          name: "codelink",
          title: "CodeLink",
          version: "0.1.0",
        },
        capabilities: {
          requestAttestation: false,
          optOutNotificationMethods: [
            "command/exec/outputDelta",
            "item/agentMessage/delta",
            "item/plan/delta",
            "item/fileChange/outputDelta",
            "item/reasoning/summaryTextDelta",
            "item/reasoning/textDelta",
          ],
        },
      });
      session.notify("initialized", {});

      const method = existingThreadId ? "thread/resume" : "thread/start";
      const threadResponse = (await session.request(method, {
        ...(existingThreadId
          ? { threadId: existingThreadId }
          : {
              cwd: options.cwd,
              approvalPolicy: options.approvalPolicy,
              sandbox: options.sandboxMode,
              ephemeral: false,
              ...(options.developerInstructions
                ? { developerInstructions: options.developerInstructions }
                : {}),
              ...(options.model ? { model: options.model } : {}),
            }),
      })) as {
        thread?: {
          id?: string;
          cwd?: string;
          turns?: Array<{ id?: string; status?: string }>;
        };
      };
      const threadId = threadResponse.thread?.id;
      if (!threadId) throw new Error("Codex App Server 未返回 thread id");
      options.onThreadStarted?.({
        threadId,
        ...(threadResponse.thread?.cwd
          ? { cwd: threadResponse.thread.cwd }
          : {}),
      });

      const completion = session.waitForTurn(threadId);
      const input = [{ type: "text", text: prompt, text_elements: [] }];
      const activeTurn = existingThreadId
        ? threadResponse.thread?.turns
            ?.slice()
            .reverse()
            .find((turn) => turn.status === "inProgress" && turn.id)
        : undefined;
      let turnId: string | undefined;
      if (activeTurn?.id) {
        const turnResponse = (await session.request("turn/steer", {
          threadId,
          expectedTurnId: activeTurn.id,
          input,
        })) as { turnId?: string };
        turnId = turnResponse.turnId;
      } else {
        const turnResponse = (await session.request("turn/start", {
          threadId,
          ...(!existingThreadId
            ? {
                cwd: options.cwd,
                approvalPolicy: options.approvalPolicy,
                sandboxPolicy: sandboxPolicy(options),
                ...(options.model ? { model: options.model } : {}),
              }
            : {}),
          input,
        })) as { turn?: { id?: string } };
        turnId = turnResponse.turn?.id;
      }
      if (!turnId) throw new Error("Codex App Server 未返回 turn id");
      session.selectTurn(turnId);

      const turnCompletion = await completion;
      let finalResponse = turnCompletion.finalResponse;
      if (!finalResponse) {
        const threadReadResponse = await session.request("thread/read", {
          threadId,
          includeTurns: true,
        });
        finalResponse = finalResponseFromThreadRead(
          threadReadResponse,
          turnId,
        );
      }
      if (!finalResponse) finalResponse = turnCompletion.fallbackResponse;
      return {
        threadId,
        turnId,
        finalResponse,
        ...(threadResponse.thread?.cwd
          ? { cwd: threadResponse.thread.cwd }
          : {}),
      };
    } finally {
      session.close();
    }
  }
}

class AppServerSession {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private turnThreadId?: string;
  private turnId?: string;
  private turnResolve?: (value: TurnCompletion) => void;
  private turnReject?: (error: Error) => void;
  private turnTimer?: NodeJS.Timeout;
  private turnSettled = false;
  private queuedTurnMessages: RpcResponse[] = [];
  private finalMessages: string[] = [];
  private fallbackMessages: string[] = [];
  private stderr = "";
  private closed = false;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly requestTimeoutMs: number,
    private readonly turnTimeoutMs: number,
  ) {
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => this.onLine(line));
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-20_000);
    });
    child.once("error", (error) => this.fail(error));
    child.once("exit", (code, signal) => {
      if (this.closed) return;
      this.fail(
        new Error(
          `Codex App Server 提前退出（code=${String(code)}, signal=${String(signal)}）${this.stderr ? `\n${this.stderr}` : ""}`,
        ),
      );
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(
          new Error(
            `Codex App Server ${method} 请求超时（${this.requestTimeoutMs}ms）`,
          ),
        );
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        this.write({ id, method, params });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  notify(method: string, params: unknown): void {
    this.write({ method, params });
  }

  waitForTurn(threadId: string): Promise<TurnCompletion> {
    this.turnThreadId = threadId;
    return new Promise((resolve, reject) => {
      this.turnResolve = (value) => {
        if (this.turnSettled) return;
        this.turnSettled = true;
        if (this.turnTimer) clearTimeout(this.turnTimer);
        resolve(value);
      };
      this.turnReject = (error) => {
        if (this.turnSettled) return;
        this.turnSettled = true;
        if (this.turnTimer) clearTimeout(this.turnTimer);
        reject(error);
      };
    });
  }

  selectTurn(turnId: string): void {
    this.turnId = turnId;
    this.turnTimer = setTimeout(() => {
      this.turnReject?.(
        new Error(
          `Codex App Server ${this.turnThreadId}/${turnId} 执行超时（${this.turnTimeoutMs}ms）`,
        ),
      );
    }, this.turnTimeoutMs);
    const queued = this.queuedTurnMessages;
    this.queuedTurnMessages = [];
    for (const message of queued) this.onMessage(message);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin.end();
    const forceClose = setTimeout(() => {
      if (this.child.exitCode === null) this.child.kill("SIGTERM");
    }, 1_000);
    forceClose.unref();
  }

  private write(message: unknown): void {
    if (!this.child.stdin.writable)
      throw new Error("Codex App Server stdin 已关闭");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private onLine(line: string): void {
    let message: RpcResponse;
    try {
      message = JSON.parse(line) as RpcResponse;
    } catch {
      return;
    }

    this.onMessage(message);
  }

  private onMessage(message: RpcResponse): void {
    if (
      message.method &&
      (typeof message.id === "number" || typeof message.id === "string")
    ) {
      this.respondToServerRequest(message.id, message.method);
      return;
    }

    if (message.method && message.params) {
      const params = message.params as Record<string, unknown>;
      if (params.threadId !== this.turnThreadId) return;
      const turn = params.turn as { id?: string } | undefined;
      const messageTurnId =
        typeof params.turnId === "string" ? params.turnId : turn?.id;
      if (!messageTurnId) return;
      if (!this.turnId) {
        this.queuedTurnMessages.push(message);
        return;
      }
      if (messageTurnId !== this.turnId) return;
      this.handleTurnMessage(message.method, params);
      return;
    }

    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            `Codex App Server ${message.error.code ?? "error"}: ${message.error.message ?? "unknown error"}`,
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
  }

  private respondToServerRequest(id: number | string, method: string): void {
    switch (method) {
      case "item/commandExecution/requestApproval":
      case "item/fileChange/requestApproval":
        this.write({ id, result: { decision: "decline" } });
        return;
      case "item/tool/requestUserInput":
        this.write({ id, result: { answers: {} } });
        return;
      case "mcpServer/elicitation/request":
        this.write({
          id,
          result: { action: "decline", content: null, _meta: null },
        });
        return;
      case "item/permissions/requestApproval":
        this.write({ id, result: { permissions: {}, scope: "turn" } });
        return;
      case "execCommandApproval":
      case "applyPatchApproval":
        this.write({ id, result: { decision: "denied" } });
        return;
      default:
        this.write({
          id,
          error: {
            code: -32601,
            message: `Method not supported: ${method}`,
          },
        });
    }
  }

  private handleTurnMessage(
    method: string,
    params: Record<string, unknown>,
  ): void {
    if (method === "item/completed") {
      const item = params.item as
        | { type?: string; text?: string; phase?: string }
        | undefined;
      if (item?.type !== "agentMessage" || !item.text?.trim()) return;
      this.fallbackMessages.push(item.text.trim());
      if (item.phase === "final_answer") this.finalMessages.push(item.text.trim());
      return;
    }

    if (method === "turn/completed") {
      const turn = params.turn as
        | { status?: string; error?: { message?: string } | null }
        | undefined;
      if (turn?.status !== "completed") {
        this.turnReject?.(
          new Error(turn?.error?.message ?? `Codex turn ${turn?.status ?? "failed"}`),
        );
        return;
      }
      this.turnResolve?.({
        finalResponse: this.finalMessages.join("\n\n").trim(),
        fallbackResponse: this.fallbackMessages.slice(-1).join("\n\n").trim(),
      });
    }
  }

  private fail(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.turnReject?.(error);
  }
}

function sandboxPolicy(options: AppServerRunOptions): Record<string, unknown> {
  if (options.sandboxMode === "danger-full-access") {
    return { type: "dangerFullAccess" };
  }
  if (options.sandboxMode === "read-only") {
    return { type: "readOnly", networkAccess: options.networkAccessEnabled };
  }
  return {
    type: "workspaceWrite",
    writableRoots: [],
    networkAccess: options.networkAccessEnabled,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

function finalResponseFromThreadRead(
  response: unknown,
  turnId: string,
): string {
  const result = response as {
    thread?: {
      turns?: Array<{
        id?: string;
        items?: Array<{
          type?: string;
          text?: string;
          phase?: string | null;
        }>;
      }>;
    };
  };
  const targetTurn = result.thread?.turns?.find((turn) => turn.id === turnId);
  const messages =
    targetTurn?.items
      ?.filter(
        (item) => item.type === "agentMessage" && Boolean(item.text?.trim()),
      )
      .map((item) => ({ text: item.text!.trim(), phase: item.phase })) ?? [];
  const finalMessages = messages.filter(
    (message) => message.phase === "final_answer",
  );
  return (finalMessages.length > 0 ? finalMessages : messages.slice(-1))
    .map((message) => message.text)
    .join("\n\n")
    .trim();
}

function normalizeTimeout(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const timeout = value ?? fallback;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`${name} 必须是大于 0 的有限毫秒数`);
  }
  return timeout;
}

export function resolveCodexBin(options: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (candidate: string) => boolean;
} = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? fs.existsSync;
  const override = env.CODELINK_CODEX_BIN?.trim();
  if (override) return override;

  if (platform === "darwin") {
    const appBins = [
      "/Applications/ChatGPT.app/Contents/Resources/codex",
      "/Applications/Codex.app/Contents/Resources/codex",
    ];
    const appBin = appBins.find((candidate) => exists(candidate));
    if (appBin) return appBin;
  }

  const pathApi = platform === "win32" ? path.win32 : path;
  const directories = (env.PATH || env.Path || "").split(pathApi.delimiter);
  const names =
    platform === "win32"
      ? ["codex.exe", "codex.cmd", "codex.bat", "codex.com"]
      : ["codex"];
  for (const directory of directories) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      if (exists(candidate)) return candidate;
    }
  }
  return platform === "win32" ? "codex.cmd" : "codex";
}
