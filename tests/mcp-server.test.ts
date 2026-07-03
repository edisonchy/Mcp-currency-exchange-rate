import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.js";

test("MCP server lists the conversion tools with output schemas", async () => {
  const { client, close } = await connectTestClient();

  try {
    const { tools } = await client.listTools();
    const toolNames = tools.map((tool) => tool.name).sort();

    assert.deepEqual(toolNames, ["convert_currencies", "convert_currency"]);
    assert.ok(
      tools.every((tool) => tool.outputSchema),
      "every tool should declare an output schema",
    );
  } finally {
    await close();
  }
});

test("convert_currency handles identity conversion without an API call", async (t) => {
  const originalFetch = globalThis.fetch;
  const { client, close } = await connectTestClient();

  globalThis.fetch = async () => {
    throw new Error("fetch should not be called for identity conversion");
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  try {
    const result = await client.callTool({
      name: "convert_currency",
      arguments: { from: "gbp", to: "GBP", amount: 50 },
    });

    const structuredContent = requireRecord(result.structuredContent);
    const conversion = requireRecord(structuredContent.conversion);

    assert.equal(result.isError, undefined);
    assert.equal(conversion.from, "GBP");
    assert.equal(conversion.to, "GBP");
    assert.equal(conversion.converted, 50);
    assert.equal(conversion.rate, 1);
    assert.equal(conversion.source, "identity");
    assert.equal(structuredContent.apiResponse, null);
  } finally {
    await close();
  }
});

test("convert_currency defaults the source currency to GBP", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.EXCHANGE_RATE_API_KEY;
  const { client, close } = await connectTestClient();

  process.env.EXCHANGE_RATE_API_KEY = "test-api-key";

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv("EXCHANGE_RATE_API_KEY", originalApiKey);
  });

  let receivedUrl: string | URL | Request | undefined;
  let receivedOptions: RequestInit | undefined;

  globalThis.fetch = async (url, options) => {
    receivedUrl = url;
    receivedOptions = options;

    return new Response(
      JSON.stringify({
        amount: 10,
        converted: 12.5,
        rate: 1.25,
        timestamp: "2026-07-03T00:00:00.000Z",
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const result = await client.callTool({
      name: "convert_currency",
      arguments: { to: "usd", amount: 10 },
    });

    const options = requireValue(receivedOptions);
    const headers = requireHeaders(options);
    const structuredContent = requireRecord(result.structuredContent);
    const conversion = requireRecord(structuredContent.conversion);

    assert.equal(receivedUrl, "https://api.exchangerate.dev/v1/convert/GBP/USD/10");
    assert.equal(headers.Authorization, "Bearer test-api-key");
    assert.equal(result.isError, undefined);
    assert.equal(conversion.from, "GBP");
    assert.equal(conversion.to, "USD");
    assert.equal(conversion.converted, 12.5);
    assert.equal(conversion.rate, 1.25);
  } finally {
    await close();
  }
});

test("convert_currencies preserves pair order and skips API calls for identities", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.EXCHANGE_RATE_API_KEY;
  const { client, close } = await connectTestClient();

  process.env.EXCHANGE_RATE_API_KEY = "test-api-key";

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv("EXCHANGE_RATE_API_KEY", originalApiKey);
  });

  let receivedBody: unknown;

  globalThis.fetch = async (_url, options) => {
    receivedBody = JSON.parse(requireStringBody(requireValue(options)));

    return new Response(
      JSON.stringify({
        conversions: [
          {
            amount: 10,
            converted: 13,
            rate: 1.3,
            timestamp: "2026-07-03T00:00:00.000Z",
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const result = await client.callTool({
      name: "convert_currencies",
      arguments: {
        from: "gbp",
        pairs: [
          { to: "GBP", amount: 5 },
          { to: "usd", amount: 10 },
        ],
      },
    });

    const structuredContent = requireRecord(result.structuredContent);
    const conversions = requireArray(structuredContent.conversions).map(
      requireRecord,
    );

    assert.equal(result.isError, undefined);
    assert.deepEqual(receivedBody, {
      from: "GBP",
      pairs: [["USD", 10]],
    });
    assert.equal(conversions.length, 2);
    const identityConversion = conversions[0];
    const usdConversion = conversions[1];

    assert.ok(identityConversion);
    assert.ok(usdConversion);
    assert.equal(identityConversion.to, "GBP");
    assert.equal(identityConversion.converted, 5);
    assert.equal(identityConversion.source, "identity");
    assert.equal(usdConversion.to, "USD");
    assert.equal(usdConversion.converted, 13);
    assert.equal(usdConversion.rate, 1.3);
  } finally {
    await close();
  }
});

test("convert_currencies matches reordered API conversions by target currency", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.EXCHANGE_RATE_API_KEY;
  const { client, close } = await connectTestClient();

  process.env.EXCHANGE_RATE_API_KEY = "test-api-key";

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv("EXCHANGE_RATE_API_KEY", originalApiKey);
  });

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        conversions: [
          {
            to: "EUR",
            amount: 10,
            converted: 11,
            rate: 1.1,
          },
          {
            to: "USD",
            amount: 10,
            converted: 13,
            rate: 1.3,
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );

  try {
    const result = await client.callTool({
      name: "convert_currencies",
      arguments: {
        from: "gbp",
        pairs: [
          { to: "usd", amount: 10 },
          { to: "eur", amount: 10 },
        ],
      },
    });

    const structuredContent = requireRecord(result.structuredContent);
    const conversions = requireArray(structuredContent.conversions).map(
      requireRecord,
    );
    const usdConversion = conversions[0];
    const eurConversion = conversions[1];

    assert.equal(result.isError, undefined);
    assert.ok(usdConversion);
    assert.ok(eurConversion);
    assert.equal(usdConversion.to, "USD");
    assert.equal(usdConversion.converted, 13);
    assert.equal(eurConversion.to, "EUR");
    assert.equal(eurConversion.converted, 11);
  } finally {
    await close();
  }
});

async function connectTestClient() {
  const server = createServer();
  const client = new Client(
    { name: "exchange-rate-mcp-test", version: "1.0.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    server,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

function requireValue<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  return value as T;
}

function requireRecord(value: unknown): Record<string, unknown> {
  assert.ok(isRecord(value));
  return value;
}

function requireArray(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}

function requireHeaders(options: RequestInit): Record<string, string> {
  assert.ok(isRecord(options.headers));
  return options.headers as Record<string, string>;
}

function requireStringBody(options: RequestInit): string {
  assert.equal(typeof options.body, "string");
  return options.body as string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
