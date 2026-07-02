#!/usr/bin/env node

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./index.js";

const HOST = "0.0.0.0";
const PORT = parsePort(process.env.PORT ?? "65535");
const MCP_PATH = "/mcp";

const app = express();

function parsePort(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const port = Number(value);

  if (port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

app.use(express.json({ limit: "1mb" }));

app.options(MCP_PATH, (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, mcp-session-id, mcp-protocol-version",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.status(204).end();
});

app.get("/", (_req, res) => {
  res.json({
    name: "exchange-rate-mcp",
    status: "ok",
    mcpPath: MCP_PATH,
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.all(MCP_PATH, async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.listen(PORT, HOST, () => {
  console.error(
    `exchange-rate-mcp listening on http://${HOST}:${PORT}${MCP_PATH}`,
  );
});
