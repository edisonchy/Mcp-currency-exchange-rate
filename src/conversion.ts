import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  type JsonObject,
  requestExchangeRate,
  toFiniteNumber,
} from "./exchange-rate-api.js";
import { AmountSchema, CurrencyCodeSchema } from "./validation.js";

const DEFAULT_FROM_CURRENCY = "GBP";
const MAX_BATCH_PAIRS = 10;

const SingleConvertInputSchema = z.object({
  amount: AmountSchema.describe("Amount to convert."),
  to: CurrencyCodeSchema.describe("Target currency code, for example USD."),
  from: CurrencyCodeSchema.default(DEFAULT_FROM_CURRENCY).describe(
    "Source currency code. Defaults to GBP when omitted.",
  ),
});

const BatchConvertInputSchema = z.object({
  from: CurrencyCodeSchema.default(DEFAULT_FROM_CURRENCY).describe(
    "Source currency code for every conversion. Defaults to GBP when omitted.",
  ),
  pairs: z
    .array(
      z.object({
        to: CurrencyCodeSchema.describe("Target currency code."),
        amount: AmountSchema.describe("Amount to convert to this currency."),
      }),
    )
    .min(1)
    .max(MAX_BATCH_PAIRS)
    .describe("Conversions to run. Each pair has a target currency and amount."),
});

const ApiResponseSchema = z.record(z.string(), z.unknown()).nullable();

const ConversionSchema = z.object({
  from: CurrencyCodeSchema,
  to: CurrencyCodeSchema,
  amount: z.number(),
  rate: z.number(),
  converted: z.number(),
  derived: z.boolean().nullable(),
  derivation_bps_max: z.number().nullable(),
  source: z.string().nullable(),
  sources: z.record(z.string(), z.string()).nullable(),
  market_session: z.string().nullable(),
  timestamp: z.string().nullable(),
  data_updated_at: z.string().nullable(),
  notice: z.string().nullable(),
});

const SingleConvertOutputSchema = z.object({
  conversion: ConversionSchema,
  apiResponse: ApiResponseSchema,
});

const BatchConvertOutputSchema = z.object({
  from: CurrencyCodeSchema,
  conversions: z.array(ConversionSchema),
  apiResponse: ApiResponseSchema,
});

type Conversion = z.infer<typeof ConversionSchema>;
type BatchConvertInput = z.infer<typeof BatchConvertInputSchema>;
type BatchPair = BatchConvertInput["pairs"][number];
type ConversionRequest = {
  from: string;
  to: string;
  amount: number;
};
type BatchRequest = {
  from: string;
  pairs: BatchPair[];
};
type IndexedBatchPair = BatchPair & {
  index: number;
};

export function registerConversionTools(server: McpServer): void {
  server.registerTool(
    "convert_currency",
    {
      title: "Convert Currency",
      description:
        "Convert one currency amount. If source currency is omitted, GBP is used by default.",
      inputSchema: SingleConvertInputSchema,
      outputSchema: SingleConvertOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ amount, to, from }): Promise<CallToolResult> => {
      const request = {
        amount,
        from,
        to,
      };
      const { conversion, apiResponse } = await convertSingle(request);

      return {
        content: [{ type: "text", text: formatConversion(conversion) }],
        structuredContent: {
          conversion,
          apiResponse,
        },
      };
    },
  );

  server.registerTool(
    "convert_currencies",
    {
      title: "Convert Currencies",
      description:
        "Convert multiple currency amounts from one source currency. If source currency is omitted, GBP is used by default.",
      inputSchema: BatchConvertInputSchema,
      outputSchema: BatchConvertOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ from, pairs }): Promise<CallToolResult> => {
      const request = {
        from,
        pairs: pairs.map((pair) => ({
          amount: pair.amount,
          to: pair.to,
        })),
      };
      const { conversions, apiResponse } = await convertBatch(request);

      return {
        content: [
          {
            type: "text",
            text: conversions.map(formatConversion).join("\n"),
          },
        ],
        structuredContent: {
          from: request.from,
          conversions,
          apiResponse,
        },
      };
    },
  );
}

async function convertSingle({ from, to, amount }: ConversionRequest): Promise<{
  conversion: Conversion;
  apiResponse: JsonObject | null;
}> {
  if (from === to) {
    return {
      conversion: makeIdentityConversion({ from, to, amount }),
      apiResponse: null,
    };
  }

  const response = await requestExchangeRate(
    `/v1/convert/${encodeURIComponent(from)}/${encodeURIComponent(
      to,
    )}/${encodeURIComponent(String(amount))}`,
  );

  const conversion = normalizeConversion(response, response, {
    from,
    to,
    amount,
  });

  return { conversion, apiResponse: response };
}

async function convertBatch({ from, pairs }: BatchRequest): Promise<{
  conversions: Conversion[];
  apiResponse: JsonObject | null;
}> {
  const conversions = new Array<Conversion>(pairs.length);
  const apiPairs: IndexedBatchPair[] = [];

  for (const [index, pair] of pairs.entries()) {
    if (pair.to === from) {
      conversions[index] = makeIdentityConversion({
        from,
        to: pair.to,
        amount: pair.amount,
      });
      continue;
    }

    apiPairs.push({ index, ...pair });
  }

  let apiResponse: JsonObject | null = null;

  if (apiPairs.length > 0) {
    apiResponse = await requestExchangeRate("/v1/convert", {
      method: "POST",
      body: {
        from,
        pairs: apiPairs.map((pair) => [pair.to, pair.amount]),
      },
    });

    const apiConversions = Array.isArray(apiResponse.conversions)
      ? apiResponse.conversions.map((conversion) =>
          isJsonObject(conversion) ? conversion : {},
        )
      : [apiResponse];
    const remainingApiConversions = [...apiConversions];

    for (const pair of apiPairs) {
      const apiConversion = takeApiConversionForPair(
        remainingApiConversions,
        pair,
      );

      conversions[pair.index] = normalizeConversion(
        apiConversion,
        apiResponse,
        {
          from,
          to: pair.to,
          amount: pair.amount,
        },
      );
    }
  }

  return { conversions, apiResponse };
}

function makeIdentityConversion({
  from,
  to,
  amount,
}: ConversionRequest): Conversion {
  return {
    from,
    to,
    amount,
    rate: 1,
    converted: amount,
    derived: false,
    derivation_bps_max: null,
    source: "identity",
    sources: { [to]: "identity" },
    market_session: null,
    timestamp: new Date().toISOString(),
    data_updated_at: null,
    notice: "Source and target currencies are the same; no API call was made.",
  };
}

function normalizeConversion(
  conversion: JsonObject,
  response: JsonObject,
  request: ConversionRequest,
): Conversion {
  const amount = toFiniteNumber(conversion.amount) ?? request.amount;
  const converted = toFiniteNumber(conversion.converted);
  const rate =
    toFiniteNumber(conversion.rate) ??
    (converted !== undefined && amount > 0 ? converted / amount : undefined);

  if (converted === undefined || rate === undefined) {
    throw new Error("ExchangeRate.dev returned an unexpected conversion shape.");
  }

  return {
    from: currencyCodeValue(
      stringValue(conversion.from) ?? stringValue(response.from) ?? request.from,
    ),
    to: currencyCodeValue(
      stringValue(conversion.to) ?? stringValue(response.to) ?? request.to,
    ),
    amount,
    rate,
    converted,
    derived:
      booleanValue(conversion.derived) ?? booleanValue(response.derived) ?? null,
    derivation_bps_max:
      toFiniteNumber(conversion.derivation_bps_max) ??
      toFiniteNumber(response.derivation_bps_max) ??
      null,
    source: stringValue(conversion.source) ?? stringValue(response.source) ?? null,
    sources:
      stringRecordValue(conversion.sources) ??
      stringRecordValue(response.sources) ??
      null,
    market_session:
      stringValue(conversion.market_session) ??
      stringValue(response.market_session) ??
      null,
    timestamp:
      stringValue(conversion.timestamp) ?? stringValue(response.timestamp) ?? null,
    data_updated_at:
      stringValue(conversion.data_updated_at) ??
      stringValue(response.data_updated_at) ??
      null,
    notice: stringValue(conversion.notice) ?? stringValue(response.notice) ?? null,
  };
}

function formatConversion(conversion: Conversion): string {
  return `${formatNumber(conversion.amount)} ${conversion.from} = ${formatNumber(
    conversion.converted,
  )} ${conversion.to}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 8,
  }).format(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function takeApiConversionForPair(
  remainingApiConversions: JsonObject[],
  pair: IndexedBatchPair,
): JsonObject {
  const matchingIndex = remainingApiConversions.findIndex((conversion) =>
    conversionMatchesPair(conversion, pair),
  );

  if (matchingIndex >= 0) {
    return remainingApiConversions.splice(matchingIndex, 1)[0] ?? {};
  }

  const nextConversion = remainingApiConversions.shift();

  if (!nextConversion) {
    throw new Error("ExchangeRate.dev returned fewer conversions than requested.");
  }

  const targetCurrency = optionalCurrencyCode(nextConversion.to);

  if (targetCurrency && targetCurrency !== pair.to) {
    throw new Error("ExchangeRate.dev returned conversions that could not be matched.");
  }

  return nextConversion;
}

function conversionMatchesPair(
  conversion: JsonObject,
  pair: IndexedBatchPair,
): boolean {
  const targetCurrency = optionalCurrencyCode(conversion.to);

  if (!targetCurrency || targetCurrency !== pair.to) {
    return false;
  }

  const amount = toFiniteNumber(conversion.amount);

  return amount === undefined || amount === pair.amount;
}

function currencyCodeValue(value: string): string {
  return CurrencyCodeSchema.parse(value);
}

function optionalCurrencyCode(value: unknown): string | undefined {
  const parsed = CurrencyCodeSchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringRecordValue(value: unknown): Record<string, string> | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  const entries = Object.entries(value);

  if (!entries.every(([, entryValue]) => typeof entryValue === "string")) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, string>;
}
