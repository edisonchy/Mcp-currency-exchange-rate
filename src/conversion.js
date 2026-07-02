import { z } from "zod";
import {
  normalizeCurrencyCode,
  requestExchangeRate,
  toFiniteNumber,
} from "./exchange-rate-api.js";
import { AmountSchema, CurrencyCodeSchema } from "./validation.js";
import { toolError } from "./tool-result.js";

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

export function registerConversionTools(server) {
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
    async ({ amount, to, from }) => {
      try {
        const request = {
          amount,
          from: normalizeCurrencyCode(from),
          to: normalizeCurrencyCode(to),
        };
        const { conversion, apiResponse } = await convertSingle(request);

        return {
          content: [{ type: "text", text: formatConversion(conversion) }],
          structuredContent: {
            conversion,
            apiResponse,
          },
        };
      } catch (error) {
        return toolError(error);
      }
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
    async ({ from, pairs }) => {
      try {
        const request = {
          from: normalizeCurrencyCode(from),
          pairs: pairs.map((pair) => ({
            amount: pair.amount,
            to: normalizeCurrencyCode(pair.to),
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
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

async function convertSingle({ from, to, amount }) {
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

async function convertBatch({ from, pairs }) {
  const conversions = new Array(pairs.length);
  const apiPairs = [];

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

  let apiResponse = null;

  if (apiPairs.length > 0) {
    apiResponse = await requestExchangeRate("/v1/convert", {
      method: "POST",
      body: {
        from,
        pairs: apiPairs.map((pair) => [pair.to, pair.amount]),
      },
    });

    const apiConversions = Array.isArray(apiResponse.conversions)
      ? apiResponse.conversions
      : [apiResponse];

    for (const [apiIndex, pair] of apiPairs.entries()) {
      conversions[pair.index] = normalizeConversion(
        apiConversions[apiIndex] ?? {},
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

function makeIdentityConversion({ from, to, amount }) {
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

function normalizeConversion(conversion, response, request) {
  const amount = toFiniteNumber(conversion.amount) ?? request.amount;
  const converted = toFiniteNumber(conversion.converted);
  const rate =
    toFiniteNumber(conversion.rate) ??
    (converted !== undefined && amount > 0 ? converted / amount : undefined);

  if (converted === undefined || rate === undefined) {
    throw new Error("ExchangeRate.dev returned an unexpected conversion shape.");
  }

  return {
    from: normalizeCurrencyCode(conversion.from ?? response.from ?? request.from),
    to: normalizeCurrencyCode(conversion.to ?? response.to ?? request.to),
    amount,
    rate,
    converted,
    derived: conversion.derived ?? response.derived ?? null,
    derivation_bps_max:
      toFiniteNumber(conversion.derivation_bps_max) ??
      toFiniteNumber(response.derivation_bps_max) ??
      null,
    source: conversion.source ?? response.source ?? null,
    sources: conversion.sources ?? response.sources ?? null,
    market_session: conversion.market_session ?? response.market_session ?? null,
    timestamp: conversion.timestamp ?? response.timestamp ?? null,
    data_updated_at:
      conversion.data_updated_at ?? response.data_updated_at ?? null,
    notice: conversion.notice ?? response.notice ?? null,
  };
}

function formatConversion(conversion) {
  return `${formatNumber(conversion.amount)} ${conversion.from} = ${formatNumber(
    conversion.converted,
  )} ${conversion.to}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 8,
  }).format(value);
}
