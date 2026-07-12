import fs from "node:fs";
import { randomUUID } from "node:crypto";

import { CodexTaskRunner } from "./codex-task-runner.js";
import { CodelinkDaemon } from "./daemon.js";
import { DaemonClient } from "./daemon-client.js";
import { exportOpenClawState, importOpenClawState } from "./openclaw-state.js";
import { StateStore } from "./state.js";
import { WeixinClient } from "./weixin/client.js";
import { loginWithQr } from "./weixin/login.js";

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);
  const store = new StateStore();
  store.ensure();
  ensureConfig(store);
  const config = store.loadConfig();

  switch (command) {
    case "login": {
      const client = new WeixinClient(config.weixin);
      await loginWithQr({
        client,
        store,
        legacyGet: args.includes("--legacy-get"),
      });
      return;
    }
    case "daemon": {
      const client = new WeixinClient(config.weixin);
      const runner = new CodexTaskRunner(config.codex, store);
      const daemon = new CodelinkDaemon(config, store, client, runner);
      const shutdown = () => {
        void daemon.stop().finally(() => process.exit(0));
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      await daemon.start();
      return;
    }
    case "status": {
      printJson(await new DaemonClient().status());
      return;
    }
    case "tasks": {
      printJson(await new DaemonClient().recentTasks());
      return;
    }
    case "task": {
      const prompt = args.join(" ").trim();
      if (!prompt) throw new Error("用法：codelink task <任务文字>");
      const runner = new CodexTaskRunner(config.codex, store);
      printJson(
        await runner.runTask({
          messageId: `local-${randomUUID()}`,
          fromUserId: "local-cli",
          prompt,
          startNew: true,
        }),
      );
      return;
    }
    case "send": {
      const text = args.join(" ").trim();
      if (!text) throw new Error("用法：codelink send <消息文字>");
      printJson(await new DaemonClient().send({ text }));
      return;
    }
    case "state": {
      printJson({
        stateDir: store.dir,
        config: store.path("config.json"),
        session: store.path("weixin-session.json"),
        syncCursor: store.path("get-updates.json"),
        processedMessages: store.path("processed-messages.json"),
        contextTokens: store.path("context-tokens.json"),
        conversations: store.path("conversations.json"),
        tasks: store.path("tasks.json"),
        qr: store.path("login-qr.png"),
      });
      return;
    }
    case "export-openclaw": {
      const outputPath = args[0]?.trim();
      const stateDir = args[1]?.trim();
      if (!outputPath) {
        throw new Error(
          "用法：codelink export-openclaw <输出文件> [OpenClaw state dir]",
        );
      }
      const bundle = exportOpenClawState({ outputPath, stateDir });
      printJson({
        ok: true,
        outputPath,
        accountId: bundle.account.accountId,
        userId: bundle.account.userId,
        tokenPresent: true,
        contextTokens: Object.keys(bundle.contextTokens ?? {}).length,
        routeTagPresent: Boolean(bundle.routeTag),
      });
      return;
    }
    case "import-openclaw": {
      const inputPath = args[0]?.trim();
      if (!inputPath) {
        throw new Error("用法：codelink import-openclaw <状态包文件>");
      }
      printJson(importOpenClawState({ inputPath, store }));
      process.stdout.write(
        "导入完成。请安全删除传输中的状态包，然后运行 codelink daemon 验证 token。\n",
      );
      return;
    }
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(helpText());
      return;
    default:
      throw new Error(`未知命令：${command}\n\n${helpText()}`);
  }
}

function ensureConfig(store: StateStore): void {
  const configPath = store.path("config.json");
  if (!fs.existsSync(configPath)) store.saveConfig(store.loadConfig());
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function helpText(): string {
  return (
    `CodeLink 0.1.0\n\n` +
    `用法：\n` +
    `  codelink login [--legacy-get]  显示微信二维码并保存登录凭证\n` +
    `  codelink daemon         前台运行微信监听与本地通知 API\n` +
    `  codelink status         检查守护进程和微信连接\n` +
    `  codelink tasks          查看最近由微信发起或续接的 Codex 记录\n` +
    `  codelink task <文字>    本地创建新的 CodeLink Codex 会话\n` +
    `  codelink send <文字>    向默认微信用户发送通知\n` +
    `  codelink state          显示本地状态文件路径（不会输出 token）\n` +
    `  codelink export-openclaw <文件> [目录]  从云端 OpenClaw 导出最小微信状态包\n` +
    `  codelink import-openclaw <文件>         导入云端微信状态包\n`
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
