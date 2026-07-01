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
  assetClass?: "crypto" | "tokenized_asset";
};

const STABLE_QUOTE_PAIR =
  /^(USDT|USDC|BUSD|TUSD|FDUSD|DAI|USDP|PYUSD|USDE|EUR|USD)(USD|USDC|USDT|EUR)$/i;

export function piataBaseAsset(symbol: string): string {
  const m = symbol.match(/^(.+?)(USD|USDC|USDT|EUR)$/i);
  return m ? m[1]!.toUpperCase() : symbol.replace(/USDC$/i, "") || symbol;
}

export function isValidPiataPairSymbol(symbol: string): boolean {
  return /^[A-Z0-9]{2,}(USD|USDC|USDT|EUR)$/i.test(symbol);
}

export function filterTradablePairs(
  tickers: Ticker24h[],
  tradableSymbols: Set<string>,
  testnet: boolean,
  pairBlacklist?: string[] | null,
  minQuoteVolume?: number
): Ticker24h[] {
  const minVol = minQuoteVolume ?? (testnet ? 50_000 : 250_000);
  return tickers
    .filter((t) => tradableSymbols.has(t.symbol))
    .filter((t) => !STABLE_QUOTE_PAIR.test(t.symbol))
    .filter((t) => !isPairBlacklisted(t.symbol, pairBlacklist))
    .filter((t) => t.lastPrice >= 0.0001)
    .filter((t) => t.quoteVolume >= minVol);
}

/** @deprecated use filterTradablePairs */
export function filterTradableUsdcPairs(
  tickers: Ticker24h[],
  spotUsdcSymbols: Set<string>,
  testnet: boolean,
  pairBlacklist?: string[] | null
): Ticker24h[] {
  return filterTradablePairs(tickers, spotUsdcSymbols, testnet, pairBlacklist);
}

export function toPiataRow(t: Ticker24h, assetClass?: "crypto" | "tokenized_asset"): PiataRow {
  return {
    symbol: t.symbol,
    base: piataBaseAsset(t.symbol),
    price: t.lastPrice,
    change24h: t.priceChangePercent,
    quoteVolume24h: t.quoteVolume,
    high24h: t.highPrice,
    low24h: t.lowPrice,
    assetClass,
  };
}

export type PiataMarketSections = {
  trending: PiataRow[];
  hot: PiataRow[];
  rising24h: PiataRow[];
  falling24h: PiataRow[];
  catalog: PiataRow[];
  catalogCount: number;
  btc: { price: number; change24h: number; quoteVolume24h: number } | null;
};

export function buildSpotUsdcCatalog(
  tickers: Ticker24h[],
  tradableSymbols: Set<string>,
  pairBlacklist?: string[] | null,
  assetClass?: "crypto" | "tokenized_asset"
): PiataRow[] {
  return tickers
    .filter((t) => tradableSymbols.has(t.symbol))
    .filter((t) => !STABLE_QUOTE_PAIR.test(t.symbol))
    .filter((t) => !isPairBlacklisted(t.symbol, pairBlacklist))
    .filter((t) => t.lastPrice >= 0.0001)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .map((t) => toPiataRow(t, assetClass));
}

export function buildPiataMarket(
  tickers: Ticker24h[],
  tradableSymbols: Set<string>,
  testnet: boolean,
  pairBlacklist?: string[] | null,
  opts?: { minQuoteVolume?: number; assetClass?: "crypto" | "tokenized_asset"; btcSymbol?: string }
): PiataMarketSections {
  const sections = buildPiataSections(
    tickers,
    tradableSymbols,
    testnet,
    pairBlacklist,
    opts?.minQuoteVolume,
    opts?.assetClass
  );
  const catalog = buildSpotUsdcCatalog(tickers, tradableSymbols, pairBlacklist, opts?.assetClass);
  const btcSym =
    opts?.btcSymbol ||
    [...tradableSymbols].find((s) => s.startsWith("BTC")) ||
    "BTCUSDC";
  const btcTicker = tradableSymbols.has(btcSym) ? tickers.find((t) => t.symbol === btcSym) : undefined;

  return {
    ...sections,
    catalog,
    catalogCount: catalog.length,
    btc: btcTicker
      ? {
          price: btcTicker.lastPrice,
          change24h: btcTicker.priceChangePercent,
          quoteVolume24h: btcTicker.quoteVolume,
        }
      : null,
  };
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
  tradableSymbols: Set<string>,
  testnet: boolean,
  pairBlacklist?: string[] | null,
  minQuoteVolume?: number,
  assetClass?: "crypto" | "tokenized_asset"
) {
  const pool = filterTradablePairs(
    tickers,
    tradableSymbols,
    testnet,
    pairBlacklist,
    minQuoteVolume
  );

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

  const mapRow = (t: Ticker24h) => toPiataRow(t, assetClass);

  return {
    trending: trending.map(mapRow),
    hot: hot.map(mapRow),
    rising24h: rising24h.map(mapRow),
    falling24h: falling24h.map(mapRow),
  };
}

export function formatQuoteVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}
