import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const cleanup: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(() => {
  for (const dir of cleanup.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("CLI daemon state", () => {
  it("lists private daemon paths without reading credential contents", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-cli-"));
    cleanup.push(dir);

    const { stdout } = await runCli("state", dir);
    const state = JSON.parse(stdout) as Record<string, string>;

    expect(state.daemonAuthToken).toBe(path.join(dir, "daemon-api-token"));
    expect(state.processedMessages).toBe(
      path.join(dir, "processed-messages.json"),
    );
    expect(fs.existsSync(state.daemonAuthToken)).toBe(false);
  });

  it("prints degraded status but exits nonzero until the daemon is ready", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelink-cli-"));
    cleanup.push(dir);
    const server = http.createServer((_request, response) => {
      response.writeHead(503, {
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(
        JSON.stringify({ ok: false, degraded: true, sessionExpired: true }),
      );
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("test server did not expose a TCP address");
    }

    try {
      await expect(
        runCli("status", dir, `http://127.0.0.1:${address.port}`),
      ).rejects.toMatchObject({
        code: 1,
        stdout: expect.stringContaining('"degraded": true'),
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

function runCli(command: string, stateDir: string, baseUrl?: string) {
  return execFileAsync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", command],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODELINK_STATE_DIR: stateDir,
        ...(baseUrl ? { CODELINK_DAEMON_URL: baseUrl } : {}),
      },
    },
  );
}
