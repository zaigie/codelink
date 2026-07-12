import { describe, expect, it } from "vitest";

import {
  installationFailure,
  normalizeInstallationError,
} from "../scripts/setup-lib.mjs";

describe("安装失败摘要", () => {
  it("包含稳定错误码、失败命令和可执行下一步", () => {
    expect(
      installationFailure({
        code: "E_PLUGIN_INSTALL_FAILED",
        command: "/Applications/Codex/codex",
        status: 7,
        nextStep: "请新建任务后重试插件安装。",
      }).message,
    ).toBe(
      "E_PLUGIN_INSTALL_FAILED：codex 执行失败（退出码 7）。请新建任务后重试插件安装。",
    );
  });

  it("为未分类异常补充通用错误码，同时保留已有稳定错误码", () => {
    expect(normalizeInstallationError(new Error("spawn failed")).message).toBe(
      "E_INSTALL_UNEXPECTED：spawn failed。请检查安装日志和 INSTALL.md 后重试。",
    );
    expect(
      normalizeInstallationError(
        new Error("E_PORT_OCCUPIED：端口被占用；请释放端口。"),
      ).message,
    ).toBe("E_PORT_OCCUPIED：端口被占用；请释放端口。");
  });
});
