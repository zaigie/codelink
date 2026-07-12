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
});
