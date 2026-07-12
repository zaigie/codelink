import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { StdioCodexAppServer } from "../src/app-server-client.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("StdioCodexAppServer", () => {
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

    expect(result.finalResponse).toBe("adjusted");
  });
});
