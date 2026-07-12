import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as childProcess from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveCodexBin,
  StdioCodexAppServer,
} from "../src/app-server-client.js";

vi.mock("node:child_process", { spy: true });

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("StdioCodexAppServer", () => {
  it("resolves a Windows codex.cmd wrapper from PATH for foreground use", () => {
    const wrapper = "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd";
    expect(
      resolveCodexBin({
        platform: "win32",
        env: { Path: "C:\\Users\\me\\AppData\\Roaming\\npm" },
        exists: (candidate) => candidate === wrapper,
      }),
    ).toBe(wrapper);
  });

  it("uses thread/start and returns the completed final agent message", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-app-server-"));
    cleanup.push(dir);
    const fakeCodex = path.join(dir, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({ id: request.id, result: { codexHome: "/tmp" } });
  } else if (request.method === "thread/start") {
    if ("threadSource" in request.params) {
      send({ id: request.id, error: { code: 400, message: "unexpected threadSource" } });
      return;
    }
    if (!request.params.developerInstructions.includes("CodeLink")) {
      send({ id: request.id, error: { code: 400, message: "missing developerInstructions" } });
      return;
    }
    send({ id: request.id, result: { thread: { id: "app-thread-123" } } });
  } else if (request.method === "turn/start") {
    if (request.params.input[0].text !== "do the work") {
      send({ id: request.id, error: { code: 400, message: "polluted user prompt" } });
      return;
    }
    send({ id: request.id, result: { turn: { id: "turn-1", status: "inProgress" } } });
    send({ method: "item/completed", params: {
      threadId: request.params.threadId,
      turnId: "turn-1",
      item: { type: "agentMessage", phase: "final_answer", text: "finished" }
    } });
    send({ method: "turn/completed", params: {
      threadId: request.params.threadId,
      turn: { id: "turn-1", status: "completed", error: null }
    } });
  }
});
`,
      { mode: 0o700 },
    );

    const client = new StdioCodexAppServer(fakeCodex);
    const result = await client.runNewThread(
      {
        cwd: dir,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        networkAccessEnabled: false,
        developerInstructions: "CodeLink task rules",
      },
      "do the work",
    );

    expect(result).toEqual({
      threadId: "app-thread-123",
      turnId: "turn-1",
      finalResponse: "finished",
    });
  });

  it("resumes a stored thread and appends a new user turn", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-app-server-"));
    cleanup.push(dir);
    const fakeCodex = path.join(dir, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({ id: request.id, result: { codexHome: "/tmp" } });
  } else if (request.method === "thread/resume") {
    if (request.params.threadId !== "stored-thread") {
      send({ id: request.id, error: { code: 400, message: "wrong thread" } });
      return;
    }
    if ("developerInstructions" in request.params || "model" in request.params) {
      send({ id: request.id, error: { code: 400, message: "resume settings were overwritten" } });
      return;
    }
    send({ id: request.id, result: { thread: { id: "stored-thread", cwd: "/existing/project" } } });
  } else if (request.method === "turn/start") {
    if (["cwd", "approvalPolicy", "sandboxPolicy", "model"].some((key) => key in request.params)) {
      send({ id: request.id, error: { code: 400, message: "turn settings were overwritten" } });
      return;
    }
    if (request.params.input[0].text !== "continue the work") {
      send({ id: request.id, error: { code: 400, message: "wrong prompt" } });
      return;
    }
    send({ id: request.id, result: { turn: { id: "turn-2", status: "inProgress" } } });
    send({ method: "item/completed", params: {
      threadId: request.params.threadId,
      turnId: "turn-2",
      item: { type: "agentMessage", phase: "final_answer", text: "continued" }
    } });
    send({ method: "turn/completed", params: {
      threadId: request.params.threadId,
      turn: { id: "turn-2", status: "completed", error: null }
    } });
  }
});
`,
      { mode: 0o700 },
    );

    const client = new StdioCodexAppServer(fakeCodex);
    const result = await client.continueThread(
      {
        cwd: dir,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        networkAccessEnabled: false,
        developerInstructions: "CodeLink conversation rules",
      },
      "stored-thread",
      "continue the work",
    );

    expect(result).toEqual({
      threadId: "stored-thread",
      turnId: "turn-2",
      finalResponse: "continued",
      cwd: "/existing/project",
    });
  });

  it("steers the active turn when a WeChat reply arrives during a desktop task", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-app-server-"));
    cleanup.push(dir);
    const fakeCodex = path.join(dir, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({ id: request.id, result: { codexHome: "/tmp" } });
  } else if (request.method === "thread/resume") {
    send({ id: request.id, result: { thread: {
      id: "active-thread",
      cwd: "/existing/project",
      turns: [{ id: "active-turn", status: "inProgress", items: [] }]
    } } });
  } else if (request.method === "turn/start") {
    send({ id: request.id, error: { code: 400, message: "started a second turn" } });
  } else if (request.method === "turn/steer") {
    if (request.params.expectedTurnId !== "active-turn" || request.params.input[0].text !== "adjust the plan") {
      send({ id: request.id, error: { code: 400, message: "wrong steer request" } });
      return;
    }
    send({ id: request.id, result: { turnId: "active-turn" } });
    send({ method: "item/completed", params: {
      threadId: request.params.threadId,
      turnId: "active-turn",
      item: { type: "agentMessage", phase: "final_answer", text: "adjusted" }
    } });
    send({ method: "turn/completed", params: {
      threadId: request.params.threadId,
      turn: { id: "active-turn", status: "completed", error: null }
    } });
  }
});
`,
      { mode: 0o700 },
    );

    const client = new StdioCodexAppServer(fakeCodex);
    const result = await client.continueThread(
      {
        cwd: dir,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        networkAccessEnabled: false,
      },
      "active-thread",
      "adjust the plan",
    );

    expect(result).toMatchObject({
      threadId: "active-thread",
      turnId: "active-turn",
      finalResponse: "adjusted",
    });
  });

  it("ignores item and turn notifications from other threads and turns", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-app-server-"));
    cleanup.push(dir);
    const fakeCodex = path.join(dir, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const complete = (threadId, turnId, text) => {
  send({ method: "item/completed", params: {
    threadId,
    turnId,
    item: { type: "agentMessage", phase: "final_answer", text }
  } });
  send({ method: "turn/completed", params: {
    threadId,
    turn: { id: turnId, status: "completed", error: null }
  } });
};
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({ id: request.id, result: { codexHome: "/tmp" } });
  } else if (request.method === "thread/start") {
    send({ id: request.id, result: { thread: { id: "target-thread" } } });
  } else if (request.method === "turn/start") {
    send({ id: request.id, result: { turn: { id: "target-turn", status: "inProgress" } } });
    complete("other-thread", "target-turn", "wrong thread");
    complete("target-thread", "other-turn", "wrong turn");
    complete("target-thread", "target-turn", "right answer");
  }
});
`,
      { mode: 0o700 },
    );

    const result = await new StdioCodexAppServer(fakeCodex).runNewThread(
      {
        cwd: dir,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        networkAccessEnabled: false,
      },
      "do the isolated work",
    );

    expect(result).toMatchObject({
      threadId: "target-thread",
      turnId: "target-turn",
      finalResponse: "right answer",
    });
  });

  it("fails instead of hanging when an RPC response exceeds its timeout", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-app-server-"));
    cleanup.push(dir);
    const fakeCodex = path.join(dir, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin });
`,
      { mode: 0o700 },
    );

    const client = new StdioCodexAppServer(fakeCodex, {
      requestTimeoutMs: 25,
    });

    await expect(
      client.runNewThread(
        {
          cwd: dir,
          sandboxMode: "workspace-write",
          approvalPolicy: "never",
          networkAccessEnabled: false,
        },
        "never answered",
      ),
    ).rejects.toThrow("initialize 请求超时（25ms）");
  });

  it("fails instead of hanging when a started turn exceeds its timeout", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-app-server-"));
    cleanup.push(dir);
    const fakeCodex = path.join(dir, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({ id: request.id, result: { codexHome: "/tmp" } });
  } else if (request.method === "thread/start") {
    send({ id: request.id, result: { thread: { id: "slow-thread" } } });
  } else if (request.method === "turn/start") {
    send({ id: request.id, result: { turn: { id: "slow-turn", status: "inProgress" } } });
  }
});
`,
      { mode: 0o700 },
    );

    const client = new StdioCodexAppServer(fakeCodex, {
      turnTimeoutMs: 25,
    });

    await expect(
      client.runNewThread(
        {
          cwd: dir,
          sandboxMode: "workspace-write",
          approvalPolicy: "never",
          networkAccessEnabled: false,
        },
        "too slow",
      ),
    ).rejects.toThrow("slow-thread/slow-turn 执行超时（25ms）");
  });

  it("reads the target turn when completion notifications contain no final text", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-app-server-"));
    cleanup.push(dir);
    const fakeCodex = path.join(dir, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({ id: request.id, result: { codexHome: "/tmp" } });
  } else if (request.method === "thread/start") {
    send({ id: request.id, result: { thread: { id: "read-thread" } } });
  } else if (request.method === "turn/start") {
    send({ id: request.id, result: { turn: { id: "read-turn", status: "inProgress" } } });
    send({ method: "item/completed", params: {
      threadId: "read-thread",
      turnId: "read-turn",
      item: { type: "agentMessage", phase: "commentary", text: "still working" }
    } });
    send({ method: "turn/completed", params: {
      threadId: "read-thread",
      turn: { id: "read-turn", status: "completed", error: null }
    } });
  } else if (request.method === "thread/read") {
    if (request.params.threadId !== "read-thread" || request.params.includeTurns !== true) {
      send({ id: request.id, error: { code: 400, message: "wrong thread/read params" } });
      return;
    }
    send({ id: request.id, result: { thread: { id: "read-thread", turns: [
      { id: "older-turn", items: [
        { type: "agentMessage", phase: "final_answer", text: "older answer" }
      ] },
      { id: "read-turn", items: [
        { type: "agentMessage", phase: "commentary", text: "working" },
        { type: "agentMessage", phase: "final_answer", text: "recovered answer" }
      ] }
    ] } } });
  }
});
`,
      { mode: 0o700 },
    );

    const result = await new StdioCodexAppServer(fakeCodex).runNewThread(
      {
        cwd: dir,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        networkAccessEnabled: false,
      },
      "recover the answer",
    );

    expect(result).toMatchObject({
      threadId: "read-thread",
      turnId: "read-turn",
      finalResponse: "recovered answer",
    });
  });

  it("answers server requests without leaving the turn waiting", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-app-server-"));
    cleanup.push(dir);
    const fakeCodex = path.join(dir, "codex");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const assert = require("node:assert/strict");
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const queued = [
  {
    request: { method: "item/fileChange/requestApproval", id: 0, params: {} },
    response: { id: 0, result: { decision: "decline" } }
  },
  {
    request: { method: "item/tool/requestUserInput", id: "input-1", params: {} },
    response: { id: "input-1", result: { answers: {} } }
  },
  {
    request: { method: "mcpServer/elicitation/request", id: 40, params: {} },
    response: { id: 40, result: { action: "decline", content: null, _meta: null } }
  },
  {
    request: { method: "item/permissions/requestApproval", id: "permissions-1", params: {} },
    response: { id: "permissions-1", result: { permissions: {}, scope: "turn" } }
  },
  {
    request: { method: "execCommandApproval", id: 41, params: {} },
    response: { id: 41, result: { decision: "denied" } }
  },
  {
    request: { method: "applyPatchApproval", id: "legacy-patch", params: {} },
    response: { id: "legacy-patch", result: { decision: "denied" } }
  },
  {
    request: { method: "future/serverRequest", id: "unknown-1", params: {} },
    response: {
      id: "unknown-1",
      error: { code: -32601, message: "Method not supported: future/serverRequest" }
    }
  }
];
let active;
let turnRequest;
const watchdog = setTimeout(() => {
  process.stderr.write("server request watchdog expired\\n");
  process.exit(2);
}, 1500);

const sendNext = () => {
  active = queued.shift();
  if (active) {
    send(active.request);
    return;
  }
  clearTimeout(watchdog);
  send({ method: "item/completed", params: {
    threadId: turnRequest.params.threadId,
    turnId: "turn-server-requests",
    item: { type: "agentMessage", phase: "final_answer", text: "handled safely" }
  } });
  send({ method: "turn/completed", params: {
    threadId: turnRequest.params.threadId,
    turn: { id: "turn-server-requests", status: "completed", error: null }
  } });
};

rl.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      send({ id: message.id, result: { codexHome: "/tmp" } });
    } else if (message.method === "thread/start") {
      send({ id: message.id, result: { thread: { id: "server-request-thread" } } });
    } else if (message.method === "turn/start") {
      turnRequest = message;
      active = {
        request: {
          method: "item/commandExecution/requestApproval",
          id: message.id,
          params: {}
        },
        response: { id: message.id, result: { decision: "decline" } },
        releasesTurn: true
      };
      send(active.request);
    } else if (active && message.method === undefined) {
      assert.deepStrictEqual(message, active.response);
      if (active.releasesTurn) {
        send({
          id: turnRequest.id,
          result: { turn: { id: "turn-server-requests", status: "inProgress" } }
        });
      }
      sendNext();
    }
  } catch (error) {
    process.stderr.write(String(error) + "\\n");
    process.exit(3);
  }
});
`,
      { mode: 0o700 },
    );

    const client = new StdioCodexAppServer(fakeCodex, {
      requestTimeoutMs: 2_000,
      turnTimeoutMs: 2_000,
    });
    const result = await client.runNewThread(
      {
        cwd: dir,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        networkAccessEnabled: false,
      },
      "handle server requests",
    );

    expect(result).toEqual({
      threadId: "server-request-thread",
      turnId: "turn-server-requests",
      finalResponse: "handled safely",
    });
  });

  it("launches a codex.cmd shim through a shell even when its path contains spaces", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-app-server-"));
    cleanup.push(dir);
    const binDir = path.join(dir, "bin with spaces");
    fs.mkdirSync(binDir);
    const fakeCodex = path.join(binDir, "codex.cmd");
    fs.writeFileSync(
      fakeCodex,
      `#!/usr/bin/env node
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    send({ id: request.id, result: { codexHome: "/tmp" } });
  } else if (request.method === "thread/start") {
    send({ id: request.id, result: { thread: { id: "shim-thread" } } });
  } else if (request.method === "turn/start") {
    send({ id: request.id, result: { turn: { id: "shim-turn", status: "inProgress" } } });
    send({ method: "item/completed", params: {
      threadId: "shim-thread",
      turnId: "shim-turn",
      item: { type: "agentMessage", phase: "final_answer", text: "shim worked" }
    } });
    send({ method: "turn/completed", params: {
      threadId: "shim-thread",
      turn: { id: "shim-turn", status: "completed", error: null }
    } });
  }
});
`,
      { mode: 0o700 },
    );

    const result = await new StdioCodexAppServer(fakeCodex).runNewThread(
      {
        cwd: dir,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        networkAccessEnabled: false,
      },
      "run through shim",
    );

    expect(result.finalResponse).toBe("shim worked");
    const [command, options] = vi.mocked(childProcess.spawn).mock.calls[0]!;
    expect(command).toBe(
      `"${fakeCodex}" app-server --listen stdio://`,
    );
    expect((options as { shell?: boolean }).shell).toBe(true);
  });
});
