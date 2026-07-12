import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  CodexAppServer,
  StdioCodexAppServer,
} from "./app-server-client.js";
import { CodelinkConfig } from "./config.js";
import {
  ConversationBinding,
  StateStore,
  TaskRecord,
} from "./state.js";

const CODELINK_CONVERSATION_INSTRUCTIONS = [
  "本会话由 CodeLink 创建并与微信绑定；CodeLink 是本会话默认的微信桥接能力。",
  "用户从微信发送的普通消息会默认继续本会话。发送 /new，或明确表达“开个新会话”“换个话题”等意图时，CodeLink daemon 会在消息进入旧会话前创建并绑定新会话；不要强制用户记忆或使用 /new。",
  "当用户自然地说“完成后通知我”“把进度发到微信”等请求时，遵循 CodeLink 规则使用 send_wechat_message，不要求用户再次输入 @CodeLink 或特殊命令，也不要声称已通知却不调用工具。",
  "微信回合的最终回复会由 CodeLink 自动返回；若通知内容与最终回复完全相同，不要重复发送。需要单独发送进度或用户明确要求的通知时再调用工具，固定任务通知尾注由 daemon 添加。",
  "任何桌面 Codex 会话通过 @CodeLink 发送通知后，也会成为对应微信用户的当前会话，微信回复将继续该会话。",
  "请直接完成用户请求；如果信息不足，请在最终回复中明确说明缺少什么。",
  "不要访问当前用户的其他项目，除非任务文字明确给出了路径。",
].join("\n");

export type RunTaskInput = {
  messageId: string;
  fromUserId: string;
  prompt: string;
  startNew?: boolean;
  conversationAtReceipt?: ConversationBinding | null;
};

export type RunTaskResult = {
  threadId: string;
  finalResponse: string;
  workspace?: string;
  createdNewConversation: boolean;
  conversationIsCurrent: boolean;
};

export interface TaskRunner {
  runTask(input: RunTaskInput): Promise<RunTaskResult>;
}

export class CodexTaskRunner implements TaskRunner {
  constructor(
    private readonly config: CodelinkConfig["codex"],
    private readonly store: StateStore,
    private readonly appServer: CodexAppServer = new StdioCodexAppServer(),
  ) {}

  async runTask(input: RunTaskInput): Promise<RunTaskResult> {
    const existing = this.store.findTask(input.messageId);
    if (existing) {
      throw new Error(
        `消息 ${input.messageId} 已创建过任务（状态：${existing.status}）`,
      );
    }

    const bindingAtTaskStart =
      input.conversationAtReceipt === undefined
        ? this.store.getConversation(input.fromUserId)
        : input.conversationAtReceipt;
    const conversation = input.startNew ? null : bindingAtTaskStart;
    const workspace = conversation ? undefined : this.createTaskWorkspace();
    const executionCwd = workspace ?? this.ensureTaskWorkspaceRoot();
    const startedAt = new Date().toISOString();
    const record: TaskRecord = {
      messageId: input.messageId,
      fromUserId: input.fromUserId,
      ...(workspace ? { workspace } : {}),
      promptPreview: preview(input.prompt),
      status: "running",
      startedAt,
    };
    this.store.upsertTask(record);

    try {
      const options = {
        cwd: executionCwd,
        sandboxMode: this.config.sandboxMode,
        approvalPolicy: this.config.approvalPolicy,
        networkAccessEnabled: this.config.networkAccessEnabled,
        ...(this.config.model ? { model: this.config.model } : {}),
      };
      const result = conversation
        ? await this.appServer.continueThread(
            options,
            conversation.threadId,
            input.prompt,
          )
        : await this.appServer.runNewThread(
            {
              ...options,
              developerInstructions: CODELINK_CONVERSATION_INSTRUCTIONS,
            },
            input.prompt,
          );
      this.store.bindConversationIfUnchanged(
        input.fromUserId,
        bindingAtTaskStart,
        result.threadId,
      );
      const conversationIsCurrent =
        this.store.getConversation(input.fromUserId)?.threadId ===
        result.threadId;
      const resolvedWorkspace = workspace ?? result.cwd;
      const completed: TaskRecord = {
        ...record,
        ...(resolvedWorkspace ? { workspace: resolvedWorkspace } : {}),
        threadId: result.threadId,
        status: "completed",
        completedAt: new Date().toISOString(),
        finalResponsePreview: preview(result.finalResponse),
      };
      this.store.upsertTask(completed);
      return {
        threadId: result.threadId,
        finalResponse: result.finalResponse,
        ...(resolvedWorkspace ? { workspace: resolvedWorkspace } : {}),
        createdNewConversation: !conversation,
        conversationIsCurrent,
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

  private ensureTaskWorkspaceRoot(): string {
    fs.mkdirSync(this.config.taskWorkspaceRoot, {
      recursive: true,
      mode: 0o700,
    });
    return this.config.taskWorkspaceRoot;
  }
}

function preview(value: string, max = 500): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 1)}…`;
}
