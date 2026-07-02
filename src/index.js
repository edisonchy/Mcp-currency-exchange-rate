import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConversionTools } from "./conversion.js";

export function createServer() {
  const server = new McpServer(
    {
      name: "exchange-rate-mcp",
      version: "1.0.0",
    },
    {
      instructions:
        "Use convert_currency for single currency conversions and convert_currencies for batch conversions.",
    },
  );

  registerConversionTools(server);

  return server;
}
