import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { registerConversionTools } from "./conversion.js";

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "exchange-rate-mcp",
      version: packageJson.version,
    },
    {
      instructions:
        "Use convert_currency for single currency conversions and convert_currencies for batch conversions.",
    },
  );

  registerConversionTools(server);

  return server;
}
