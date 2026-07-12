import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { DaemonClient } from "./daemon-client.js";
import { isCodexThreadId } from "./codex-thread-id.js";

export function createMcpServer(client = new DaemonClient()): McpServer {
  const server = new McpServer({ name: "codelink", version: "0.1.0" });

  server.registerTool(
    "get_wechat_status",
    {
      title: "Get CodeLink WeChat status",
      description:
        "Check whether the local CodeLink daemon, WeChat session, default notification context, and current Codex conversation binding are ready. This never returns the bot token.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => asToolResult(await client.status()),
  );

  server.registerTool(
    "list_recent_wechat_tasks",
    {
      title: "List recent WeChat-created Codex tasks",
      description:
        "List recent Codex turns started or continued from WeChat, including thread ids and completion status. Prompt and response content are preview-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => asToolResult(await client.recentTasks()),
  );

  server.registerTool(
    "send_wechat_message",
    {
      title: "Send a WeChat message",
      description:
        "Send a user-authorized task update, result, or summary through the local CodeLink daemon and bind the calling Codex conversation when trusted thread metadata is available. Omit userId to notify the owner who completed QR login. Requires a context token from a prior inbound WeChat message.",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .max(20_000)
          .describe(
            "The exact user-facing message to send. Do not include secrets, hidden reasoning, or unrelated local paths.",
          ),
        userId: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional already-authorized WeChat recipient id. Normally omit this.",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ text, userId }, extra) => {
      const threadId = resolveCodexThreadId(extra._meta);
      return asToolResult(
        await client.send({
          text,
          ...(userId ? { userId } : {}),
          ...(threadId ? { threadId } : {}),
        }),
      );
    },
  );

  return server;
}

export function resolveCodexThreadId(
  meta: Record<string, unknown> | undefined,
): string | undefined {
  const direct = meta?.threadId;
  if (isCodexThreadId(direct)) return direct;
  const turnMetadata = meta?.["x-codex-turn-metadata"];
  if (turnMetadata && typeof turnMetadata === "object") {
    const nested = (turnMetadata as Record<string, unknown>).thread_id;
    if (isCodexThreadId(nested)) return nested;
  }
  return undefined;
}

function asToolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent:
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : { value },
  };
}

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(
      `CodeLink MCP failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
