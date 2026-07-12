import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  CodexAppServer,
  StdioCodexAppServer,
} from "./app-server-client.js";
import { CodelinkConfig } from "./config.js";
import { StateStore, TaskRecord } from "./state.js";

const INCOMING_TASK_INSTRUCTIONS = [
  "这是一条从微信 CodeLink 收到的独立任务。",
  "请直接完成任务；如果信息不足，请在最终回复中明确说明缺少什么。",
  "不要访问当前用户的其他项目，除非任务文字明确给出了路径。",
].join("\n");

export type RunTaskInput = {
  messageId: string;
  fromUserId: string;
  prompt: string;
};

export type RunTaskResult = {
  threadId: string;
  finalResponse: string;
  workspace: string;
};

export interface TaskRunner {
  runNewTask(input: RunTaskInput): Promise<RunTaskResult>;
}

export class CodexTaskRunner implements TaskRunner {
  constructor(
    private readonly config: CodelinkConfig["codex"],
    private readonly store: StateStore,
    private readonly appServer: CodexAppServer = new StdioCodexAppServer(),
  ) {}

  async runNewTask(input: RunTaskInput): Promise<RunTaskResult> {
    const existing = this.store.findTask(input.messageId);
    if (existing) {
      throw new Error(
        `消息 ${input.messageId} 已创建过任务（状态：${existing.status}）`,
      );
    }

    const workspace = this.createTaskWorkspace();
    const startedAt = new Date().toISOString();
    const record: TaskRecord = {
      messageId: input.messageId,
      fromUserId: input.fromUserId,
      workspace,
      promptPreview: preview(input.prompt),
      status: "running",
      startedAt,
    };
    this.store.upsertTask(record);

    try {
      const result = await this.appServer.runNewThread(
        {
          cwd: workspace,
          sandboxMode: this.config.sandboxMode,
          approvalPolicy: this.config.approvalPolicy,
          networkAccessEnabled: this.config.networkAccessEnabled,
          developerInstructions: INCOMING_TASK_INSTRUCTIONS,
          ...(this.config.model ? { model: this.config.model } : {}),
        },
        input.prompt,
      );
      const completed: TaskRecord = {
        ...record,
        threadId: result.threadId,
        status: "completed",
        completedAt: new Date().toISOString(),
        finalResponsePreview: preview(result.finalResponse),
      };
      this.store.upsertTask(completed);
      return {
        threadId: result.threadId,
        finalResponse: result.finalResponse,
        workspace,
      };
    } catch (error) {
      this.store.upsertTask({
        ...record,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private createTaskWorkspace(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const taskId = `${now.toISOString().replaceAll(":", "-").replace(".", "-")}-${randomUUID().slice(0, 8)}`;
    const workspace = path.join(this.config.taskWorkspaceRoot, date, taskId);
    fs.mkdirSync(workspace, { recursive: true, mode: 0o700 });
    return workspace;
  }
}

function preview(value: string, max = 500): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 1)}…`;
}
