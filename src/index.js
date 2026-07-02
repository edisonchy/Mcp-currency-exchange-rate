#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

function isEntrypoint() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isEntrypoint()) {
  const server = createServer();
  const transport = new StdioServerTransport();

  server.connect(transport).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
