import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  classifyPortError,
  classifyPortResponse,
  installRuntimeArtifacts,
  validateRuntimeArtifacts,
} from "../scripts/setup-lib.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe("端口预检", () => {
  it("区分现有 CodeLink 和占用同端口的未知服务", () => {
    expect(
      classifyPortResponse(200, JSON.stringify({ service: "codelink", ok: true })),
    ).toBe("codelink");
    expect(classifyPortResponse(503, JSON.stringify({ ok: false }))).toBe(
      "codelink",
    );
    expect(classifyPortResponse(200, "<html>other service</html>")).toBe(
      "occupied",
    );
  });

  it("服务重启期间的连接重置是可重试状态，不误报端口占用", () => {
    expect(classifyPortError("ECONNREFUSED")).toBe("available");
    expect(classifyPortError("ECONNRESET")).toBe("transient");
    expect(classifyPortError("ETIMEDOUT")).toBe("transient");
  });
});

describe("预构建运行时", () => {
  it("校验清单中的两个运行时文件并拒绝被篡改的内容", () => {
    const pluginDir = fs.mkdtempSync(path.join(testDir, "runtime-"));
    try {
      const distDir = path.join(pluginDir, "dist");
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, "cli.cjs"), "cli");
      fs.writeFileSync(path.join(distDir, "mcp.js"), "mcp");
      fs.writeFileSync(
        path.join(distDir, "runtime-manifest.json"),
        JSON.stringify({
          schemaVersion: 1,
          files: {
            "cli.cjs":
              "99bb88401742848e032fd6f51709415fb6be169a72d2e5d7fc44289255160d3c",
            "mcp.js":
              "10182ab855ff772753c05b2fea333666b5f312835d32936b6b03e08ef2cbd6d3",
          },
        }),
      );

      expect(validateRuntimeArtifacts(pluginDir)).toMatchObject({ valid: true });
      fs.writeFileSync(path.join(distDir, "cli.cjs"), "changed");
      expect(validateRuntimeArtifacts(pluginDir)).toMatchObject({
        valid: false,
        code: "E_RUNTIME_HASH_MISMATCH",
      });
    } finally {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
  });

  it("无服务安装也复制最小运行时，并保留已有用户状态", () => {
    const root = fs.mkdtempSync(path.join(testDir, "install-"));
    try {
      const pluginDir = path.join(root, "plugin");
      const stateDir = path.join(root, "state");
      fs.mkdirSync(path.join(pluginDir, "dist"), { recursive: true });
      fs.mkdirSync(stateDir, { recursive: true, mode: 0o755 });
      if (process.platform !== "win32") fs.chmodSync(stateDir, 0o755);
      for (const [name, content] of [
        ["cli.cjs", "cli"],
        ["mcp.js", "mcp"],
        ["runtime-manifest.json", "manifest"],
      ]) {
        fs.writeFileSync(path.join(pluginDir, "dist", name), content);
      }
      fs.writeFileSync(path.join(stateDir, "weixin-session.json"), "session");

      installRuntimeArtifacts(pluginDir, stateDir);

      expect(fs.readFileSync(path.join(stateDir, "runtime", "cli.cjs"), "utf8"))
        .toBe("cli");
      expect(fs.readFileSync(path.join(stateDir, "runtime", "mcp.js"), "utf8"))
        .toBe("mcp");
      expect(fs.readFileSync(path.join(stateDir, "weixin-session.json"), "utf8"))
        .toBe("session");
      if (process.platform !== "win32") {
        expect(fs.statSync(stateDir).mode & 0o777).toBe(0o700);
        expect(fs.statSync(path.join(stateDir, "runtime")).mode & 0o777).toBe(
          0o700,
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
