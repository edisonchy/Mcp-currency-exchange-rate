const API_BASE_URL =
  process.env.EXCHANGERATE_API_BASE_URL ?? "https://api.exchangerate.dev";

export function normalizeCurrencyCode(value) {
  return value.trim().toUpperCase();
}

export function toFiniteNumber(value) {
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

export async function requestExchangeRate(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(response.status, data, text || response.statusText),
    );
  }

  if (data?.result && data.result !== "success") {
    throw new Error(getApiErrorMessage(response.status, data, text));
  }

  if (!data || typeof data !== "object") {
    throw new Error("ExchangeRate.dev returned a non-JSON response.");
  }

  return data;
}

function getApiKey() {
  const apiKey =
    process.env.EXCHANGERATE_API_KEY ?? process.env.EXCHANGE_RATE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing API key. Set EXCHANGERATE_API_KEY or EXCHANGE_RATE_API_KEY.",
    );
  }

  return apiKey;
}

function getApiErrorMessage(status, data, fallback) {
  const message =
    data?.message ??
    data?.error?.message ??
    data?.error ??
    data?.code ??
    fallback ??
    "Unknown error";

  return `ExchangeRate.dev API error (${status}): ${message}`;
}
