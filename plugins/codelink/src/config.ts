import os from "node:os";
import path from "node:path";

export type SandboxMode =
  | "read-only"
  | "workspace-write"
  | "danger-full-access";
export type ApprovalPolicy =
  | "never"
  | "on-request"
  | "on-failure"
  | "untrusted";

export type CodelinkConfig = {
  daemon: {
    host: string;
    port: number;
  };
  weixin: {
    baseUrl: string;
    botType: string;
    channelVersion: string;
    botAgent: string;
    routeTag?: string;
  };
  codex: {
    taskWorkspaceRoot: string;
    sandboxMode: SandboxMode;
    approvalPolicy: ApprovalPolicy;
    networkAccessEnabled: boolean;
    model?: string;
  };
  security: {
    allowedUserIds: string[];
  };
};

export function resolveStateDir(): string {
  return (
    process.env.CODELINK_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".codelink")
  );
}

export function defaultConfig(): CodelinkConfig {
  return {
    daemon: {
      host: "127.0.0.1",
      port: 18791,
    },
    weixin: {
      baseUrl: "https://ilinkai.weixin.qq.com",
      botType: "3",
      channelVersion: "2.4.6",
      botAgent: "CodeLink/0.1.0",
    },
    codex: {
      taskWorkspaceRoot: path.join(
        os.homedir(),
        "Documents",
        "Codex",
        "CodeLink",
      ),
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      networkAccessEnabled: false,
    },
    security: {
      allowedUserIds: [],
    },
  };
}

function mergeConfig(
  base: CodelinkConfig,
  value: Partial<CodelinkConfig>,
): CodelinkConfig {
  return {
    daemon: { ...base.daemon, ...value.daemon },
    weixin: { ...base.weixin, ...value.weixin },
    codex: { ...base.codex, ...value.codex },
    security: { ...base.security, ...value.security },
  };
}

export function parseConfig(value: unknown): CodelinkConfig {
  if (!value || typeof value !== "object") return defaultConfig();
  return mergeConfig(defaultConfig(), value as Partial<CodelinkConfig>);
}
