import assert from "node:assert/strict";
import test from "node:test";
import { requestExchangeRate, toFiniteNumber } from "../src/exchange-rate-api.js";

test("toFiniteNumber accepts finite numbers and numeric strings", () => {
  assert.equal(toFiniteNumber(12.5), 12.5);
  assert.equal(toFiniteNumber("12.5"), 12.5);
  assert.equal(toFiniteNumber(""), undefined);
  assert.equal(toFiniteNumber("abc"), undefined);
  assert.equal(toFiniteNumber(Number.POSITIVE_INFINITY), undefined);
});

test("requestExchangeRate sends bearer auth and JSON request bodies", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.EXCHANGE_RATE_API_KEY;

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

    return new Response(JSON.stringify({ result: "success", value: 123 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const data = await requestExchangeRate("/v1/test", {
    method: "POST",
    body: { from: "GBP", pairs: [["USD", 10]] },
  });

  const options = requireValue(receivedOptions);
  const headers = requireHeaders(options);

  assert.equal(receivedUrl, "https://api.exchangerate.dev/v1/test");
  assert.equal(options.method, "POST");
  assert.equal(headers.Authorization, "Bearer test-api-key");
  assert.equal(headers.Accept, "application/json");
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(requireStringBody(options)), {
    from: "GBP",
    pairs: [["USD", 10]],
  });
  assert.deepEqual(data, { result: "success", value: 123 });
});

test("requestExchangeRate throws useful API error messages", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.EXCHANGE_RATE_API_KEY;

  process.env.EXCHANGE_RATE_API_KEY = "test-api-key";

  t.after(() => {
    globalThis.fetch = originalFetch;
    restoreEnv("EXCHANGE_RATE_API_KEY", originalApiKey);
  });

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Invalid currency" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

  await assert.rejects(
    () => requestExchangeRate("/v1/test"),
    /ExchangeRate\.dev API error \(400\): Invalid currency/,
  );
});

function requireValue<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  return value as T;
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
