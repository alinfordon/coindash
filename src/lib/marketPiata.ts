import type { Ticker24h } from "./binance";
import { isPairBlacklisted } from "./pairBlacklist";

export type PiataRow = {
  symbol: string;
  base: string;
  price: number;
  change24h: number;
  quoteVolume24h: number;
  high24h: number;
  low24h: number;
};

const STABLE_USDC = /^(USDT|USDC|BUSD|TUSD|FDUSD|DAI|USDP|PYUSD|USDE|EUR|TRY|GBP)USDC$/i;

export function filterTradableUsdcPairs(
  tickers: Ticker24h[],
  spotUsdcSymbols: Set<string>,
  testnet: boolean,
  pairBlacklist?: string[] | null
): Ticker24h[] {
  const minQuoteVolume = testnet ? 50_000 : 250_000;
  return tickers
    .filter((t) => spotUsdcSymbols.has(t.symbol))
    .filter((t) => !STABLE_USDC.test(t.symbol))
    .filter((t) => !isPairBlacklisted(t.symbol, pairBlacklist))
    .filter((t) => t.lastPrice >= 0.0001)
    .filter((t) => t.quoteVolume >= minQuoteVolume);
}

export function toPiataRow(t: Ticker24h): PiataRow {
  const base = t.symbol.replace(/USDC$/i, "") || t.symbol;
  return {
    symbol: t.symbol,
    base,
    price: t.lastPrice,
    change24h: t.priceChangePercent,
    quoteVolume24h: t.quoteVolume,
    high24h: t.highPrice,
    low24h: t.lowPrice,
  };
}

export function buildSpotUsdcCatalog(
  tickers: Ticker24h[],
  spotUsdcSymbols: Set<string>,
  pairBlacklist?: string[] | null
): PiataRow[] {
  return tickers
    .filter((t) => spotUsdcSymbols.has(t.symbol))
    .filter((t) => !STABLE_USDC.test(t.symbol))
    .filter((t) => !isPairBlacklisted(t.symbol, pairBlacklist))
    .filter((t) => t.lastPrice >= 0.0001)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .map(toPiataRow);
}

/** Match symbol or base asset (e.g. btc, ETHUSDC). */
export function filterPiataByQuery(rows: PiataRow[], query: string, limit = 50): PiataRow[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return rows
    .filter((r) => r.symbol.includes(q) || r.base.includes(q))
    .slice(0, limit);
}

export function buildPiataSections(
  tickers: Ticker24h[],
  spotUsdcSymbols: Set<string>,
  testnet: boolean,
  pairBlacklist?: string[] | null
) {
  const pool = filterTradableUsdcPairs(tickers, spotUsdcSymbols, testnet, pairBlacklist);

  const trending = [...pool].sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 15);

  const rising24h = [...pool]
    .filter((t) => t.priceChangePercent > 0)
    .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
    .slice(0, 15);

  const falling24h = [...pool]
    .filter((t) => t.priceChangePercent < 0)
    .sort((a, b) => a.priceChangePercent - b.priceChangePercent)
    .slice(0, 15);

  /** Volume × momentum — proxy for „căutate / în atenție”. */
  const hot = [...pool]
    .filter((t) => t.priceChangePercent > 0)
    .sort((a, b) => b.quoteVolume * (1 + b.priceChangePercent / 100) - a.quoteVolume * (1 + a.priceChangePercent / 100))
    .slice(0, 15);

  return {
    trending: trending.map(toPiataRow),
    hot: hot.map(toPiataRow),
    rising24h: rising24h.map(toPiataRow),
    falling24h: falling24h.map(toPiataRow),
  };
}

export function formatQuoteVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}
