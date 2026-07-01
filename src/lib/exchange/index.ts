import type { RuntimeSettings } from "@/lib/settings";
import { assertActiveExchangeConnected, resolveActiveExchange } from "@/lib/exchanges";
import { BinanceAdapter } from "./binanceAdapter";
import { KrakenAdapter } from "./krakenAdapter";
import type { ExchangeAdapter, KrakenMarketScope } from "./types";

export type { ExchangeAdapter, KrakenMarketScope, AssetClass, ExitOrderBundle } from "./types";
export { tradeExitBundle, bundleOrderIds } from "./exitOrders";

export function getExchangeAdapter(settings: RuntimeSettings): ExchangeAdapter {
  const id = resolveActiveExchange(settings);
  assertActiveExchangeConnected(settings);
  if (id === "kraken") {
    const scope = (settings.krakenMarkets || "both") as KrakenMarketScope;
    return new KrakenAdapter(settings.krakenApiKey, settings.krakenApiSecret, scope);
  }
  return new BinanceAdapter(settings.binanceApiKey, settings.binanceApiSecret, settings.binanceTestnet);
}

export function getExchangeAdapterForTrade(
  settings: RuntimeSettings,
  trade: { exchange?: string | null }
): ExchangeAdapter {
  const id = trade.exchange === "kraken" ? "kraken" : "binance";
  if (id === "kraken") {
    const scope = (settings.krakenMarkets || "both") as KrakenMarketScope;
    return new KrakenAdapter(settings.krakenApiKey, settings.krakenApiSecret, scope);
  }
  return new BinanceAdapter(settings.binanceApiKey, settings.binanceApiSecret, settings.binanceTestnet);
}

export function isKrakenActive(settings: RuntimeSettings): boolean {
  return resolveActiveExchange(settings) === "kraken";
}

export function exchangeLabelForSettings(settings: RuntimeSettings): string {
  return resolveActiveExchange(settings) === "kraken"
    ? "Kraken"
    : settings.binanceTestnet
      ? "Binance Testnet"
      : "Binance";
}
