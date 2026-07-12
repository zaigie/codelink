import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CodexTaskRunner } from "../src/codex-task-runner.js";
import { defaultConfig } from "../src/config.js";
import { StateStore } from "../src/state.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("CodexTaskRunner", () => {
  it("creates an independent workspace and persists the Codex thread id", async () => {
    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-state-"),
    );
    const workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codelink-runner-work-"),
    );
    cleanup.push(stateDir, workspaceRoot);
    const store = new StateStore(stateDir);
    const config = {
      ...defaultConfig().codex,
      taskWorkspaceRoot: workspaceRoot,
    };
    const runNewThread = vi.fn(async () => ({
      threadId: "thread-123",
      finalResponse: "finished",
    }));
    const runner = new CodexTaskRunner(config, store, { runNewThread });

    const result = await runner.runNewTask({
      messageId: "m1",
      fromUserId: "owner",
      prompt: "do the work",
    });

    expect(result.threadId).toBe("thread-123");
    expect(fs.statSync(result.workspace).isDirectory()).toBe(true);
    expect(runNewThread).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: result.workspace,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        developerInstructions: expect.stringContaining(
          "这是一条从微信 CodeLink 收到的独立任务",
        ),
      }),
      "do the work",
    );
    expect(store.findTask("m1")).toMatchObject({
      status: "completed",
      threadId: "thread-123",
    });
  });
});
