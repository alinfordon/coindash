import type { RuntimeSettings } from "./settings";

export type ExchangeId = "binance" | "kraken";

export const EXCHANGE_IDS: ExchangeId[] = ["binance", "kraken"];

export function normalizeExchangeId(value: unknown): ExchangeId {
  return value === "kraken" ? "kraken" : "binance";
}

export function exchangeLabel(id: ExchangeId): string {
  return id === "kraken" ? "Kraken" : "Binance";
}

export function isExchangeConnected(
  settings: {
    binanceApiKey?: string;
    binanceApiSecret?: string;
    krakenApiKey?: string;
    krakenApiSecret?: string;
  },
  exchange: ExchangeId
): boolean {
  if (exchange === "binance") {
    return Boolean(settings.binanceApiKey?.trim() && settings.binanceApiSecret?.trim());
  }
  return Boolean(settings.krakenApiKey?.trim() && settings.krakenApiSecret?.trim());
}

export function getActiveExchange(value: unknown): ExchangeId {
  const raw =
    value && typeof value === "object" && "activeExchange" in (value as object)
      ? (value as { activeExchange?: unknown }).activeExchange
      : value;
  return normalizeExchangeId(raw);
}

/** Ensure active exchange has credentials; fall back to the other connected exchange. */
export function resolveActiveExchange(settings: {
  activeExchange?: unknown;
  binanceApiKey?: string;
  binanceApiSecret?: string;
  krakenApiKey?: string;
  krakenApiSecret?: string;
}): ExchangeId {
  const preferred = getActiveExchange(settings);
  if (isExchangeConnected(settings, preferred)) return preferred;
  const fallback = preferred === "binance" ? "kraken" : "binance";
  if (isExchangeConnected(settings, fallback)) return fallback;
  return preferred;
}

export function assertActiveExchangeConnected(settings: {
  activeExchange?: unknown;
  binanceApiKey?: string;
  binanceApiSecret?: string;
  krakenApiKey?: string;
  krakenApiSecret?: string;
}): void {
  const active = getActiveExchange(settings);
  if (!isExchangeConnected(settings, active)) {
    throw new Error(
      `${exchangeLabel(active)} nu este conectat — adaugă cheile API sau alege alt exchange activ.`
    );
  }
}
