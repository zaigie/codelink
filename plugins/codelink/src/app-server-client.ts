import fs from "node:fs";
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
};

export type AppServerRunResult = {
  threadId: string;
  finalResponse: string;
  cwd?: string;
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
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
  method?: string;
  params?: unknown;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
};

export class StdioCodexAppServer implements CodexAppServer {
  constructor(private readonly codexBin = resolveCodexBin()) {}

  async runNewThread(
    options: AppServerRunOptions,
    prompt: string,
  ): Promise<AppServerRunResult> {
    return this.run(options, prompt);
  }

  async continueThread(
    options: AppServerRunOptions,
    threadId: string,
    prompt: string,
  ): Promise<AppServerRunResult> {
    return this.run(options, prompt, threadId);
  }

  private async run(
    options: AppServerRunOptions,
    prompt: string,
    existingThreadId?: string,
  ): Promise<AppServerRunResult> {
    const child = spawn(this.codexBin, ["app-server", "--listen", "stdio://"], {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const session = new AppServerSession(child);

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

      const completion = session.waitForTurn(threadId);
      const input = [{ type: "text", text: prompt, text_elements: [] }];
      const activeTurn = existingThreadId
        ? threadResponse.thread?.turns
            ?.slice()
            .reverse()
            .find((turn) => turn.status === "inProgress" && turn.id)
        : undefined;
      if (activeTurn?.id) {
        await session.request("turn/steer", {
          threadId,
          expectedTurnId: activeTurn.id,
          input,
        });
      } else {
        await session.request("turn/start", {
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
        });
      }

      const finalResponse = await completion;
      return {
        threadId,
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
  private turnResolve?: (value: string) => void;
  private turnReject?: (error: Error) => void;
  private finalMessages: string[] = [];
  private fallbackMessages: string[] = [];
  private stderr = "";
  private closed = false;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
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
      this.pending.set(id, { resolve, reject });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.write({ method, params });
  }

  waitForTurn(threadId: string): Promise<string> {
    this.turnThreadId = threadId;
    return new Promise((resolve, reject) => {
      this.turnResolve = resolve;
      this.turnReject = reject;
    });
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

    if (!message.method || !message.params) return;
    const params = message.params as Record<string, unknown>;
    if (params.threadId !== this.turnThreadId) return;

    if (message.method === "item/completed") {
      const item = params.item as
        | { type?: string; text?: string; phase?: string }
        | undefined;
      if (item?.type !== "agentMessage" || !item.text?.trim()) return;
      this.fallbackMessages.push(item.text.trim());
      if (item.phase === "final_answer") this.finalMessages.push(item.text.trim());
      return;
    }

    if (message.method === "turn/completed") {
      const turn = params.turn as
        | { status?: string; error?: { message?: string } | null }
        | undefined;
      if (turn?.status !== "completed") {
        this.turnReject?.(
          new Error(turn?.error?.message ?? `Codex turn ${turn?.status ?? "failed"}`),
        );
        return;
      }
      const messages =
        this.finalMessages.length > 0
          ? this.finalMessages
          : this.fallbackMessages.slice(-1);
      this.turnResolve?.(messages.join("\n\n").trim());
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

export function resolveCodexBin(): string {
  const override = process.env.CODELINK_CODEX_BIN?.trim();
  if (override) return override;

  const appBins = [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/Applications/Codex.app/Contents/Resources/codex",
  ];
  return appBins.find((candidate) => fs.existsSync(candidate)) ?? "codex";
}
