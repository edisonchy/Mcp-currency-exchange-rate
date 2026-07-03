const API_BASE_URL: string = "https://api.exchangerate.dev";

export type JsonObject = Record<string, unknown>;

type RequestExchangeRateOptions = {
  method?: string;
  body?: unknown;
};

export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export async function requestExchangeRate(
  path: string,
  options: RequestExchangeRateOptions = {},
): Promise<JsonObject> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${getApiKey()}`,
  };
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers,
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, requestInit);

  const text = await response.text();
  let data: unknown;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  const responseData = isJsonObject(data) ? data : undefined;

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        response.status,
        responseData,
        text || response.statusText,
      ),
    );
  }

  if (responseData?.result && responseData.result !== "success") {
    throw new Error(getApiErrorMessage(response.status, responseData, text));
  }

  if (!responseData) {
    throw new Error("ExchangeRate.dev returned a non-JSON response.");
  }

  return responseData;
}

function getApiKey(): string {
  const apiKey =
    process.env.EXCHANGERATE_API_KEY?.trim() ||
    process.env.EXCHANGE_RATE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Missing API key. Set EXCHANGERATE_API_KEY or EXCHANGE_RATE_API_KEY.",
    );
  }

  return apiKey;
}

function getApiErrorMessage(
  status: number,
  data: JsonObject | undefined,
  fallback: string,
): string {
  const error = data?.error;
  const message =
    stringValue(data?.message) ??
    (isJsonObject(error) ? stringValue(error.message) : undefined) ??
    stringValue(error) ??
    stringValue(data?.code) ??
    fallback ??
    "Unknown error";

  return `ExchangeRate.dev API error (${status}): ${message}`;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
