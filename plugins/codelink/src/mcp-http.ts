import { IncomingMessage, ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { CodelinkMcpClient, createMcpServer } from "./mcp-server.js";

export type McpHttpHandlerOptions = {
  client: CodelinkMcpClient;
  allowedHosts: string[];
};

export function createMcpHttpHandler(
  options: McpHttpHandlerOptions,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const server = createMcpServer(options.client);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: options.allowedHosts,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch {
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
    } finally {
      await server.close().catch(() => undefined);
    }
  };
}
