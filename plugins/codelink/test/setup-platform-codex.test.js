import { describe, expect, it } from "vitest";

import {
  codexNativeCandidates,
  findCommandOnPath,
  resolveCodexExecutable,
  resolveNpmInvocation,
} from "../scripts/setup-lib.mjs";

describe("Codex 可执行文件解析", () => {
  it("按 Windows PATHEXT 找到 codex.cmd", () => {
    const existing = new Set(["C:\\Tools\\codex.cmd"]);
    expect(
      findCommandOnPath("codex", {
        platform: "win32",
        env: { PATH: "C:\\Tools", PATHEXT: ".EXE;.CMD" },
        exists: (candidate) => existing.has(candidate),
      }),
    ).toBe("C:\\Tools\\codex.cmd");
  });

  it("从 npm 的 Windows wrapper 推导原生 codex.exe", () => {
    const candidates = codexNativeCandidates(
      "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd",
      {
        platform: "win32",
        arch: "x64",
        realpath: (value) => value,
      },
    );
    expect(candidates).toContain(
      "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe",
    );
  });

  it("为 Windows 后台服务返回原生 codex.exe 而不是 cmd wrapper", () => {
    const wrapper = "C:\\Tools\\codex.cmd";
    const native =
      "C:\\Tools\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe";
    const existing = new Set([wrapper, native]);
    expect(
      resolveCodexExecutable({
        platform: "win32",
        arch: "x64",
        env: { PATH: "C:\\Tools", PATHEXT: ".EXE;.CMD" },
        exists: (candidate) => existing.has(candidate),
        realpath: (value) => value,
      }),
    ).toBe(native);
  });

  it("不把缺少原生包的 npm JavaScript wrapper 写入后台服务", () => {
    const wrapper = "/tools/codex";
    expect(() =>
      resolveCodexExecutable({
        platform: "linux",
        arch: "x64",
        env: { PATH: "/tools" },
        exists: (candidate) => candidate === wrapper,
        realpath: (candidate) =>
          candidate === wrapper
            ? "/packages/@openai/codex/bin/codex.js"
            : candidate,
      }),
    ).toThrow("原生二进制");
  });
});

describe("npm 调用解析", () => {
  it("允许只有 Node、没有 npm 的 Codex 内置运行时", () => {
    expect(
      resolveNpmInvocation({
        platform: "darwin",
        env: { PATH: "" },
        processExecPath: "/codex-runtime/bin/node",
        exists: (candidate) => candidate === "/codex-runtime/bin/node",
      }),
    ).toBeNull();
  });

  it("在 Windows 通过 node 直接执行带空格路径旁的 npm-cli.js", () => {
    const node = "C:\\Program Files\\nodejs\\node.exe";
    const wrapper = "C:\\Program Files\\nodejs\\npm.cmd";
    const npmCli =
      "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
    const existing = new Set([node, wrapper, npmCli]);

    expect(
      resolveNpmInvocation({
        platform: "win32",
        env: {
          PATH: "C:\\Program Files\\nodejs",
          PATHEXT: ".EXE;.CMD",
        },
        processExecPath: node,
        exists: (candidate) => existing.has(candidate),
      }),
    ).toEqual({ command: node, argsPrefix: [npmCli] });
  });
});

