import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function toolError(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  };
}
