import crypto from "crypto";
import type { Candle, MyTradeRow, SymbolInfo, Ticker24h } from "@/lib/binance";
import type { KlineInterval } from "@/lib/analysisIntervals";
import type { AssetClass, KrakenMarketScope } from "@/lib/exchange/types";

const KRAKEN_API = "https://api.kraken.com";

export type KrakenBalanceRow = {
  asset: string;
  qty: number;
  /** Spendable after open-order holds (BalanceEx). */
  available?: number;
  hold?: number;
};

export type KrakenPairMeta = {
  symbol: string;
  krakenPair: string;
  wsName: string;
  base: string;
  quote: string;
  assetClass: AssetClass;
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
};

type PairCache = {
  bySymbol: Map<string, KrakenPairMeta>;
  ts: number;
  scope: KrakenMarketScope;
};

const g = global as typeof globalThis & { __NEXUS_KRAKEN_PAIRS__?: PairCache };

const INTERVAL_MAP: Partial<Record<KlineInterval, number>> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
  "3d": 4320,
};

export function normalizeKrakenAsset(code: string): string {
  const map: Record<string, string> = {
    XXBT: "BTC",
    XBT: "BTC",
    XETH: "ETH",
    ETH: "ETH",
    ZUSD: "USD",
    USD: "USD",
    ZEUR: "EUR",
    EUR: "EUR",
    USDC: "USDC",
    USDT: "USDT",
    SOL: "SOL",
    XXRP: "XRP",
    XRP: "XRP",
  };
  return map[code] || code.replace(/^X(?=[A-Z]{3}$)/, "").replace(/^Z(?=USD|EUR|GBP)/, "");
}

function decimalsFromStep(step: number): number {
  if (step >= 1) return 0;
  const s = step.toExponential();
  const [, e] = s.split("e");
  return Math.max(0, -parseInt(e, 10));
}

export function floorKraken(value: number, step: number): number {
  if (!step || step <= 0) return value;
  const d = decimalsFromStep(step);
  return +(Math.floor(value / step) * step).toFixed(d + 2);
}

async function publicGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams(params).toString();
  const url = `${KRAKEN_API}${path}${q ? `?${q}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as { error?: string[]; result?: T };
  if (!res.ok) throw new Error(`Kraken ${path} ${res.status}`);
  if (json.error?.length) throw new Error(`Kraken ${path}: ${json.error.join(", ")}`);
  return json.result as T;
}

async function privatePost<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<T> {
  if (!apiKey?.trim() || !apiSecret?.trim()) {
    throw new Error("Missing Kraken API key/secret");
  }
  const nonce = String(Date.now() * 1000);
  const postData = new URLSearchParams({ ...params, nonce }).toString();
  const hash = crypto.createHash("sha256").update(nonce + postData).digest();
  const message = Buffer.concat([Buffer.from(path), hash]);
  const secret = Buffer.from(apiSecret, "base64");
  const signature = crypto.createHmac("sha512", secret).update(message).digest("base64");
  const res = await fetch(`${KRAKEN_API}${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: postData,
    cache: "no-store",
  });
  const json = (await res.json()) as { error?: string[]; result?: T };
  if (!res.ok) throw new Error(`Kraken ${path} ${res.status}: ${JSON.stringify(json)}`);
  if (json.error?.length) throw new Error(`Kraken ${path}: ${json.error.join(", ")}`);
  return json.result as T;
}

function parsePairEntry(name: string, row: Record<string, unknown>, assetClass: AssetClass): KrakenPairMeta | null {
  const wsname = String(row.wsname || row.altname || name);
  const parts = wsname.split("/");
  if (parts.length !== 2) return null;
  const base = parts[0]!.toUpperCase();
  const quote = parts[1]!.toUpperCase();
  if (!["USD", "USDC", "USDT", "EUR"].includes(quote)) return null;
  const symbol = `${base}${quote}`;
  const lotDecimals = Number(row.lot_decimals ?? 8);
  const pairDecimals = Number(row.pair_decimals ?? 5);
  const stepSize = Math.pow(10, -lotDecimals);
  const tickSize = Math.pow(10, -pairDecimals);
  const ordermin = Number(row.ordermin ?? stepSize);
  return {
    symbol,
    krakenPair: name,
    wsName: wsname,
    base,
    quote,
    assetClass,
    tickSize,
    stepSize,
    minQty: ordermin,
    minNotional: Math.max(ordermin * 10, 1),
  };
}

async function loadPairsForClass(aclass: "currency" | "tokenized_asset"): Promise<KrakenPairMeta[]> {
  const raw = await publicGet<Record<string, Record<string, unknown>>>("/0/public/AssetPairs", {
    aclass_base: aclass,
  });
  const assetClass: AssetClass = aclass === "tokenized_asset" ? "tokenized_asset" : "crypto";
  return Object.entries(raw || {})
    .map(([name, row]) => parsePairEntry(name, row, assetClass))
    .filter((x): x is KrakenPairMeta => x != null);
}

export async function loadKrakenPairs(scope: KrakenMarketScope = "both"): Promise<Map<string, KrakenPairMeta>> {
  const cached = g.__NEXUS_KRAKEN_PAIRS__;
  if (cached && cached.scope === scope && Date.now() - cached.ts < 60 * 60_000) {
    return cached.bySymbol;
  }
  const lists: KrakenPairMeta[] = [];
  if (scope === "crypto" || scope === "both") lists.push(...(await loadPairsForClass("currency")));
  if (scope === "stocks" || scope === "both") lists.push(...(await loadPairsForClass("tokenized_asset")));
  const bySymbol = new Map<string, KrakenPairMeta>();
  for (const p of lists) {
    const existing = bySymbol.get(p.symbol);
    if (!existing || preferKrakenPair(p, existing)) bySymbol.set(p.symbol, p);
  }
  g.__NEXUS_KRAKEN_PAIRS__ = { bySymbol, ts: Date.now(), scope };
  return bySymbol;
}

export async function resolveKrakenPair(
  symbol: string,
  scope: KrakenMarketScope,
  assetClass?: AssetClass
): Promise<KrakenPairMeta> {
  const map = await loadKrakenPairs(scope);
  const direct = map.get(symbol.toUpperCase());
  if (direct) return direct;
  if (assetClass) {
    const hit = [...map.values()].find((p) => p.symbol === symbol.toUpperCase() && p.assetClass === assetClass);
    if (hit) return hit;
  }
  throw new Error(`Unknown Kraken pair: ${symbol}`);
}

export function krakenBaseAsset(symbol: string): string {
  const m = symbol.match(/^([A-Z0-9]+?)(USD|USDC|USDT|EUR)$/i);
  return m ? m[1]!.toUpperCase() : symbol.replace(/USDC$|USDT$|USD$|EUR$/i, "");
}

export async function getKrakenBalance(apiKey: string, apiSecret: string): Promise<KrakenBalanceRow[]> {
  try {
    const raw = await privatePost<
      Record<string, { balance: string; credit?: string; credit_used?: string; hold_trade?: string }>
    >("/0/private/BalanceEx", {}, apiKey, apiSecret);
    return Object.entries(raw || {})
      .map(([code, row]) => {
        const qty = +row.balance || 0;
        const credit = +row.credit || 0;
        const creditUsed = +row.credit_used || 0;
        const hold = +row.hold_trade || 0;
        const available = Math.max(0, qty + credit - creditUsed - hold);
        return { asset: normalizeKrakenAsset(code), qty, available, hold };
      })
      .filter((r) => r.qty > 0 || (r.available ?? 0) > 0);
  } catch {
    const raw = await privatePost<Record<string, string>>("/0/private/Balance", {}, apiKey, apiSecret);
    return Object.entries(raw || {})
      .map(([asset, qty]) => ({ asset: normalizeKrakenAsset(asset), qty: +qty || 0, available: +qty || 0, hold: 0 }))
      .filter((r) => r.qty > 0);
  }
}

export async function fetchKrakenUsdcBalance(apiKey: string, apiSecret: string): Promise<number> {
  const rows = await getKrakenBalance(apiKey, apiSecret);
  return rows
    .filter((r) => r.asset === "USDC" || r.asset === "USD" || r.asset === "USDT")
    .reduce((sum, r) => sum + (r.available ?? r.qty), 0);
}

const KRAKEN_TAKER_FEE = 0.0026;

export type KrakenQuoteBalance = {
  quote: KrakenQuoteAsset;
  /** Total wallet balance. */
  total: number;
  /** Blocked by open orders. */
  hold: number;
  /** Spendable for new orders. */
  available: number;
};

function krakenQuoteRow(rows: KrakenBalanceRow[], quote: KrakenQuoteAsset): KrakenBalanceRow | undefined {
  return rows.find((r) => r.asset === quote);
}

export async function fetchKrakenQuoteBalanceDetail(
  apiKey: string,
  apiSecret: string,
  quote: KrakenQuoteAsset
): Promise<KrakenQuoteBalance> {
  const rows = await getKrakenBalance(apiKey, apiSecret);
  const row = krakenQuoteRow(rows, quote);
  const total = row?.qty ?? 0;
  const hold = row?.hold ?? 0;
  const available = row?.available ?? total;
  return { quote, total, hold, available };
}

export type KrakenQuoteAsset = "USD" | "USDC" | "USDT" | "EUR";

export function krakenQuoteAssetFromSymbol(symbol: string): KrakenQuoteAsset {
  const m = symbol.toUpperCase().match(/(USDC|USDT|EUR|USD)$/);
  return (m?.[1] as KrakenQuoteAsset) || "USD";
}

/** Kraken pairs quoted in USD/USDC/USDT (excludes EUR). */
export function isKrakenUsdQuoteSymbol(symbol: string): boolean {
  return krakenQuoteAssetFromSymbol(symbol) !== "EUR";
}

/** Spendable balance for the pair's quote currency (excludes holds + uses BalanceEx). */
export async function fetchKrakenQuoteBalance(
  apiKey: string,
  apiSecret: string,
  quote: KrakenQuoteAsset
): Promise<number> {
  const detail = await fetchKrakenQuoteBalanceDetail(apiKey, apiSecret, quote);
  return detail.available;
}

export async function fetchKrakenQuoteBalanceForPair(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  scope: KrakenMarketScope,
  assetClass?: AssetClass
): Promise<KrakenQuoteBalance> {
  const meta = await resolveKrakenPair(symbol, scope, assetClass);
  const quote = meta.quote as KrakenQuoteAsset;
  return fetchKrakenQuoteBalanceDetail(apiKey, apiSecret, quote);
}

/** Reserve headroom for Kraken taker fee + rounding on market buys (viqc). */
export function krakenBuyFeeBuffer(quoteQty: number): number {
  return Math.max(1, quoteQty * KRAKEN_TAKER_FEE + 0.25);
}

export function krakenSafeSpendAmount(available: number, quoteQty: number): number {
  const spend = Math.min(quoteQty, Math.max(0, available - krakenBuyFeeBuffer(quoteQty)));
  return Math.floor(spend * 100) / 100;
}

function krakenQuoteMismatchHint(
  quote: KrakenQuoteAsset,
  rows: KrakenBalanceRow[],
  symbol: string
): string {
  if (quote !== "USD") return "";
  const usdc = krakenQuoteRow(rows, "USDC");
  if ((usdc?.available ?? 0) >= 10) {
    const base = krakenBaseAsset(symbol);
    return ` Ai ${(usdc!.available ?? 0).toFixed(2)} USDC disponibil — perechea ${symbol} necesită USD (sau încearcă ${base}USDC dacă există).`;
  }
  return "";
}

export async function testKrakenConnection(apiKey: string, apiSecret: string) {
  const balances = await getKrakenBalance(apiKey, apiSecret);
  const usdc = balances
    .filter((r) => r.asset === "USDC" || r.asset === "USD" || r.asset === "USDT")
    .reduce((sum, r) => sum + r.qty, 0);
  return { balances, usdcFree: usdc, canTrade: true };
}

export async function krakenFetchPrice(
  symbol: string,
  scope: KrakenMarketScope,
  assetClass?: AssetClass
): Promise<number> {
  const meta = await resolveKrakenPair(symbol, scope, assetClass);
  const ac = assetClass ?? meta.assetClass;
  const tickers = await fetchKrakenTickers(ac === "tokenized_asset" ? "tokenized_asset" : undefined, meta.krakenPair);
  const row = Object.values(tickers || {})[0];
  const px = row?.c?.[0];
  if (!px) throw new Error(`Kraken ticker missing for ${symbol}`);
  return +px;
}

export async function krakenFetch24h(
  symbol: string,
  scope: KrakenMarketScope,
  assetClass?: AssetClass
): Promise<Ticker24h> {
  const meta = await resolveKrakenPair(symbol, scope, assetClass);
  const ac = assetClass ?? meta.assetClass;
  const tickers = await fetchKrakenTickers(
    ac === "tokenized_asset" ? "tokenized_asset" : undefined,
    meta.krakenPair
  );
  const row = Object.values(tickers || {})[0];
  if (!row) throw new Error(`Kraken ticker missing for ${symbol}`);
  const last = +(row.c?.[0] || 0);
  const open = +(row.p?.[0] || last);
  const change = last - open;
  return {
    symbol: meta.symbol,
    priceChange: change,
    priceChangePercent: open > 0 ? (change / open) * 100 : 0,
    lastPrice: last,
    highPrice: +(row.h?.[1] || row.h?.[0] || last),
    lowPrice: +(row.l?.[1] || row.l?.[0] || last),
    volume: +(row.v?.[1] || row.v?.[0] || 0),
    quoteVolume: +(row.v?.[1] || 0) * last,
  };
}

export async function krakenFetchAll24h(scope: KrakenMarketScope): Promise<Ticker24h[]> {
  const map = await loadKrakenPairs(scope);
  const tickerMaps: Record<string, { c?: string[]; v?: string[]; p?: string[]; h?: string[]; l?: string[] }> =
    {};

  if (scope === "crypto" || scope === "both") {
    Object.assign(tickerMaps, await fetchKrakenTickers());
  }
  if (scope === "stocks" || scope === "both") {
    Object.assign(tickerMaps, await fetchKrakenTickers("tokenized_asset"));
  }

  const out: Ticker24h[] = [];
  for (const meta of map.values()) {
    const row = tickerMaps[meta.krakenPair];
    if (!row) continue;
    const last = +(row.c?.[0] || 0);
    if (last <= 0) continue;
    const open = +(row.p?.[0] || last);
    const change = last - open;
    out.push({
      symbol: meta.symbol,
      priceChange: change,
      priceChangePercent: open > 0 ? (change / open) * 100 : 0,
      lastPrice: last,
      highPrice: +(row.h?.[1] || last),
      lowPrice: +(row.l?.[1] || last),
      volume: +(row.v?.[1] || 0),
      quoteVolume: +(row.v?.[1] || 0) * last,
    });
  }
  return out;
}

export async function krakenTopPairs(
  n: number,
  scope: KrakenMarketScope,
  minQuoteVolume = 15_000
): Promise<Ticker24h[]> {
  const all = await krakenFetchAll24h(scope);
  const stables = /^(USDT|USDC|USD|EUR)/i;
  return all
    .filter((t) => isKrakenUsdQuoteSymbol(t.symbol))
    .filter((t) => !stables.test(t.symbol))
    .filter((t) => t.lastPrice >= 0.001)
    .filter((t) => t.quoteVolume >= minQuoteVolume)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, n);
}

export function krakenWsIntervalMinutes(interval: KlineInterval): number | null {
  const m = INTERVAL_MAP[interval];
  if (m == null || m === 4320) return null;
  return m;
}

export async function krakenFetchCandles(
  symbol: string,
  interval: KlineInterval,
  limit: number,
  scope: KrakenMarketScope,
  assetClass?: AssetClass
): Promise<Candle[]> {
  const meta = await resolveKrakenPair(symbol, scope, assetClass);
  const krakenInterval = INTERVAL_MAP[interval];
  if (!krakenInterval) throw new Error(`Kraken interval not supported: ${interval}`);
  const raw = await publicGet<Record<string, (string | number)[][]>>("/0/public/OHLC", {
    pair: meta.krakenPair,
    interval: String(krakenInterval),
    ...assetClassParam(meta.assetClass),
  });
  const rows = Object.values(raw || {}).find((v) => Array.isArray(v)) || [];
  return rows.slice(-limit).map((c) => ({
    openTime: Number(c[0]) * 1000,
    open: +c[1]!,
    high: +c[2]!,
    low: +c[3]!,
    close: +c[4]!,
    volume: +c[6]!,
    closeTime: Number(c[0]) * 1000,
  }));
}

function assetClassParam(assetClass?: AssetClass): Record<string, string> {
  return assetClass === "tokenized_asset" ? { asset_class: "tokenized_asset" } : {};
}

function preferKrakenPair(candidate: KrakenPairMeta, existing: KrakenPairMeta): boolean {
  const score = (p: KrakenPairMeta) => {
    if (/SPV/i.test(p.krakenPair)) return 0;
    if (/xUSD$/i.test(p.krakenPair)) return 2;
    return 1;
  };
  return score(candidate) > score(existing);
}

async function fetchKrakenTickers(assetClass?: AssetClass, pair?: string) {
  const params: Record<string, string> = {
    ...assetClassParam(assetClass),
  };
  if (pair) params.pair = pair;
  return publicGet<
    Record<string, { c?: string[]; v?: string[]; p?: string[]; h?: string[]; l?: string[] }>
  >("/0/public/Ticker", params);
}

export async function krakenMarketBuyQuote(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  quoteQty: number,
  scope: KrakenMarketScope,
  assetClass?: AssetClass
): Promise<{ txid: string[]; executedQty: number; entryPrice: number; entryFee: number; feeCurrency: string }> {
  const meta = await resolveKrakenPair(symbol, scope, assetClass);
  const quote = meta.quote as KrakenQuoteAsset;
  if (quoteQty < meta.minNotional) {
    throw new Error(`Order size $${quoteQty} below minNotional ~$${meta.minNotional} for ${symbol}`);
  }
  const rows = await getKrakenBalance(apiKey, apiSecret);
  const bal = await fetchKrakenQuoteBalanceDetail(apiKey, apiSecret, quote);
  const { available: freeQuote, hold, total } = bal;
  const buffer = krakenBuyFeeBuffer(quoteQty);
  const mismatch = krakenQuoteMismatchHint(quote, rows, symbol);
  if (freeQuote + 1e-6 < quoteQty + buffer) {
    const holdNote = hold > 0 ? ` (${hold.toFixed(2)} ${quote} blocat în ordine deschise)` : "";
    throw new Error(
      `Insufficient ${quote} on Kraken (available ${freeQuote.toFixed(2)}${holdNote}, total ${total.toFixed(2)}, need ~${quoteQty.toFixed(2)} ${quote} incl. fees).${mismatch}`
    );
  }
  const spend = krakenSafeSpendAmount(freeQuote, quoteQty);
  if (spend < meta.minNotional) {
    throw new Error(
      `Insufficient ${quote} on Kraken after fee buffer (available ${freeQuote.toFixed(2)} ${quote}, min order ~${meta.minNotional} ${quote}).${mismatch}`
    );
  }
  const res = await privatePost<{ txid?: string[] }>(
    "/0/private/AddOrder",
    {
      pair: meta.krakenPair,
      type: "buy",
      ordertype: "market",
      volume: spend.toFixed(2),
      oflags: "viqc",
      ...assetClassParam(meta.assetClass),
    },
    apiKey,
    apiSecret
  );
  const txid = res.txid?.[0];
  if (!txid) throw new Error("Kraken buy: no txid");
  await new Promise((r) => setTimeout(r, 800));
  const order = await krakenQueryOrder(apiKey, apiSecret, txid);
  const executedQty = +order.vol_exec || 0;
  const cost = +order.cost || spend;
  const entryPrice = executedQty > 0 ? cost / executedQty : await krakenFetchPrice(symbol, scope, assetClass);
  const entryFee = Math.abs(+order.fee || 0);
  return { txid: res.txid || [txid], executedQty, entryPrice, entryFee, feeCurrency: quote };
}

export async function krakenMarketSell(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  quantity: number,
  scope: KrakenMarketScope,
  assetClass?: AssetClass
): Promise<string> {
  const meta = await resolveKrakenPair(symbol, scope, assetClass);
  const qty = floorKraken(quantity, meta.stepSize);
  const res = await privatePost<{ txid?: string[] }>(
    "/0/private/AddOrder",
    {
      pair: meta.krakenPair,
      type: "sell",
      ordertype: "market",
      volume: qty.toFixed(decimalsFromStep(meta.stepSize)),
      ...assetClassParam(assetClass),
    },
    apiKey,
    apiSecret
  );
  const txid = res.txid?.[0];
  if (!txid) throw new Error("Kraken sell: no txid");
  return txid;
}

export async function krakenPlaceExitOrders(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  quantity: number,
  takeProfit: number,
  stopLoss: number,
  scope: KrakenMarketScope,
  assetClass?: AssetClass
): Promise<{ tpOrderId?: string; slOrderId?: string; orderIds: string[]; error?: string }> {
  const meta = await resolveKrakenPair(symbol, scope, assetClass);
  const qty = floorKraken(quantity, meta.stepSize);
  const qtyStr = qty.toFixed(decimalsFromStep(meta.stepSize));
  const tpPrice = floorKraken(takeProfit, meta.tickSize).toFixed(decimalsFromStep(meta.tickSize));
  const slTrigger = floorKraken(stopLoss, meta.tickSize).toFixed(decimalsFromStep(meta.tickSize));
  const slLimit = floorKraken(stopLoss * 0.995, meta.tickSize).toFixed(decimalsFromStep(meta.tickSize));
  const orderIds: string[] = [];
  let error: string | undefined;
  let tpOrderId: string | undefined;
  let slOrderId: string | undefined;

  try {
    const tp = await privatePost<{ txid?: string[] }>(
      "/0/private/AddOrder",
      {
        pair: meta.krakenPair,
        type: "sell",
        ordertype: "limit",
        volume: qtyStr,
        price: tpPrice,
        ...assetClassParam(assetClass),
      },
      apiKey,
      apiSecret
    );
    tpOrderId = tp.txid?.[0];
    if (tpOrderId) orderIds.push(tpOrderId);
  } catch (e: any) {
    error = e.message?.slice(0, 200);
  }

  try {
    const sl = await privatePost<{ txid?: string[] }>(
      "/0/private/AddOrder",
      {
        pair: meta.krakenPair,
        type: "sell",
        ordertype: "stop-loss-limit",
        volume: qtyStr,
        price: slTrigger,
        price2: slLimit,
        ...assetClassParam(assetClass),
      },
      apiKey,
      apiSecret
    );
    slOrderId = sl.txid?.[0];
    if (slOrderId) orderIds.push(slOrderId);
  } catch (e: any) {
    error = [error, e.message?.slice(0, 200)].filter(Boolean).join(" | ");
  }

  return { tpOrderId, slOrderId, orderIds, error };
}

export async function krakenCancelOrder(
  apiKey: string,
  apiSecret: string,
  txid: string,
  assetClass?: AssetClass
): Promise<void> {
  await privatePost("/0/private/CancelOrder", { txid, ...assetClassParam(assetClass) }, apiKey, apiSecret);
}

export async function krakenFetchOrderEntryFee(
  apiKey: string,
  apiSecret: string,
  txid: string,
  quote: KrakenQuoteAsset
): Promise<{ entryFee: number; feeCurrency: string }> {
  const order = await krakenQueryOrder(apiKey, apiSecret, txid);
  return { entryFee: Math.abs(+order.fee || 0), feeCurrency: quote };
}

async function krakenQueryOrder(apiKey: string, apiSecret: string, txid: string) {
  const res = await privatePost<Record<string, Record<string, string>>>(
    "/0/private/QueryOrders",
    { txid },
    apiKey,
    apiSecret
  );
  return Object.values(res || {})[0] || {};
}

export async function krakenQueryOrders(apiKey: string, apiSecret: string, txids: string[]) {
  if (!txids.length) return {};
  return privatePost<Record<string, Record<string, string>>>(
    "/0/private/QueryOrders",
    { txid: txids.join(",") },
    apiKey,
    apiSecret
  );
}

export async function krakenFetchMyTrades(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  scope: KrakenMarketScope,
  opts: { startTime?: number; limit?: number } = {},
  assetClass?: AssetClass
): Promise<MyTradeRow[]> {
  const meta = await resolveKrakenPair(symbol, scope, assetClass);
  const params: Record<string, string> = { pair: meta.krakenPair };
  if (opts.startTime) params.start = String(Math.floor(opts.startTime / 1000));
  const raw = await privatePost<Record<string, Record<string, string>>>(
    "/0/private/TradesHistory",
    params,
    apiKey,
    apiSecret
  );
  const rows = Object.entries(raw || {}).map(([id, r]) => ({
    id: +id.replace(/\D/g, "").slice(0, 12) || 0,
    price: +r.price || 0,
    qty: +r.vol || 0,
    quoteQty: (+r.price || 0) * (+r.vol || 0),
    time: (+r.time || 0) * 1000,
    isBuyer: r.type === "buy",
  }));
  rows.sort((a, b) => b.time - a.time);
  return rows.slice(0, opts.limit ?? 50);
}

export async function krakenFetchPortfolioValue(
  apiKey: string,
  apiSecret: string,
  scope: KrakenMarketScope
): Promise<{ total: number; assets: { asset: string; qty: number; price: number; valueUsdc: number }[]; tickerOk: boolean }> {
  const balances = await getKrakenBalance(apiKey, apiSecret);
  let tickers: Ticker24h[] = [];
  let tickerOk = true;
  try {
    tickers = await krakenFetchAll24h(scope);
  } catch {
    tickerOk = false;
  }
  const priceMap = new Map(tickers.map((t) => [krakenBaseAsset(t.symbol), t.lastPrice]));
  const stables = new Set(["USDC", "USD", "USDT", "EUR"]);
  const assets: { asset: string; qty: number; price: number; valueUsdc: number }[] = [];
  let total = 0;
  for (const b of balances) {
    let price = 1;
    if (!stables.has(b.asset)) price = priceMap.get(b.asset) ?? 0;
    const valueUsdc = b.qty * price;
    total += valueUsdc;
    assets.push({ asset: b.asset, qty: b.qty, price, valueUsdc });
  }
  return { total, assets, tickerOk };
}

export function krakenPairToSymbolInfo(meta: KrakenPairMeta): SymbolInfo {
  return {
    symbol: meta.symbol,
    tickSize: meta.tickSize,
    stepSize: meta.stepSize,
    minQty: meta.minQty,
    minNotional: meta.minNotional,
  };
}

export function detectKrakenAssetClass(symbol: string, scope: KrakenMarketScope): AssetClass {
  if (/x(USD|USDC|USDT|EUR)$/i.test(symbol)) return "tokenized_asset";
  const map = g.__NEXUS_KRAKEN_PAIRS__?.bySymbol;
  const hit = map?.get(symbol.toUpperCase());
  if (hit) return hit.assetClass;
  return scope === "stocks" ? "tokenized_asset" : "crypto";
}

export type KrakenXStockRow = {
  symbol: string;
  wsName: string;
  lastPrice: number;
  change24hPct: number;
  quoteVolume: number;
};

export type KrakenXStocksProbe = {
  catalogTotal: number;
  /** null = API keys missing — only public catalog checked */
  eligible: boolean | null;
  eligibilityMessage: string;
  probedPair: string | null;
  samplePairs: KrakenXStockRow[];
};

const XSTOCK_PROBE_PREFERRED = ["AAPLxUSD", "TSLAxUSD", "NVDAxUSD", "MSFTxUSD", "GOOGLxUSD"];

function xStockIneligibleHint(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("permission denied") ||
    m.includes("not available") ||
    m.includes("not eligible") ||
    m.includes("restricted") ||
    m.includes("unavailable in") ||
    m.includes("region") ||
    (m.includes("tokenized") && m.includes("denied")) ||
    m.includes("service:unavailable")
  );
}

export async function probeKrakenXStocks(opts: {
  apiKey?: string;
  apiSecret?: string;
  sampleLimit?: number;
}): Promise<KrakenXStocksProbe> {
  const sampleLimit = Math.min(Math.max(opts.sampleLimit ?? 12, 3), 30);
  const pairs = await loadPairsForClass("tokenized_asset");
  const tradable = pairs.filter((p) => !/SPV/i.test(p.krakenPair));
  const tickers = await fetchKrakenTickers("tokenized_asset");

  const rows: KrakenXStockRow[] = [];
  for (const meta of tradable) {
    const row = tickers[meta.krakenPair];
    if (!row) continue;
    const last = +(row.c?.[0] || 0);
    if (last <= 0) continue;
    const open = +(row.p?.[0] || last);
    const change = last - open;
    rows.push({
      symbol: meta.symbol,
      wsName: meta.wsName,
      lastPrice: last,
      change24hPct: open > 0 ? (change / open) * 100 : 0,
      quoteVolume: +(row.v?.[1] || 0) * last,
    });
  }

  rows.sort((a, b) => b.quoteVolume - a.quoteVolume);
  const samplePairs = rows.slice(0, sampleLimit);
  const catalogTotal = tradable.length;

  let eligible: boolean | null = null;
  let eligibilityMessage =
    "Conectează cheile Kraken (Query + Trade) și apasă «Verifică xStocks» pentru test eligibilitate cont.";
  let probedPair: string | null = null;

  const key = opts.apiKey?.trim();
  const secret = opts.apiSecret?.trim();
  if (key && secret && catalogTotal > 0) {
    const rowPick =
      XSTOCK_PROBE_PREFERRED.map((s) => rows.find((r) => r.symbol === s)).find(Boolean) || rows[0];
    const metaPick =
      tradable.find((p) => XSTOCK_PROBE_PREFERRED.includes(p.symbol)) ||
      tradable.find((p) => /xUSD$/i.test(p.krakenPair)) ||
      tradable[0];
    const probeSymbol = rowPick?.symbol ?? metaPick?.symbol ?? null;
    const probePrice = rowPick?.lastPrice ?? null;

    if (!probeSymbol) {
      eligible = null;
      eligibilityMessage = "Perechi xStocks găsite, dar fără ticker activ momentan.";
    } else {
      probedPair = probeSymbol;
      try {
        const meta = await resolveKrakenPair(probeSymbol, "stocks", "tokenized_asset");
        const px =
          probePrice && probePrice > 0
            ? probePrice
            : await krakenFetchPrice(probeSymbol, "stocks", "tokenized_asset");
        const limitPx = floorKraken(px * 0.9, meta.tickSize);
        await privatePost<{ descr?: { order?: string } }>(
          "/0/private/AddOrder",
          {
            pair: meta.krakenPair,
            type: "buy",
            ordertype: "limit",
            price: String(limitPx),
            volume: String(meta.minQty),
            validate: "true",
            asset_class: "tokenized_asset",
          },
          key,
          secret
        );
        eligible = true;
        eligibilityMessage = `Cont eligibil — validare reușită pe ${probeSymbol} (fără ordin real).`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        eligible = xStockIneligibleHint(msg) ? false : null;
        eligibilityMessage =
          eligible === false
            ? `Cont neeligibil sau restricționat pentru xStocks: ${msg.slice(0, 220)}`
            : `Nu am putut confirma eligibilitatea: ${msg.slice(0, 220)}`;
      }
    }
  } else if (!key || !secret) {
    eligible = null;
    if (catalogTotal > 0) {
      eligibilityMessage = `${catalogTotal} perechi xStocks în catalog — conectează cheile API pentru test eligibilitate cont.`;
    } else {
      eligibilityMessage =
        "Kraken nu returnează perechi xStocks pentru regiunea/serverul curent (disponibilitate geo).";
    }
  } else {
    eligible = null;
    eligibilityMessage =
      "Kraken nu returnează perechi xStocks pentru regiunea/serverul curent (disponibilitate geo).";
  }

  return {
    catalogTotal,
    eligible,
    eligibilityMessage,
    probedPair,
    samplePairs,
  };
}
