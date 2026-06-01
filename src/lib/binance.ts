import crypto from "crypto";
import type { KlineInterval } from "./analysisIntervals";

/**
 * Lightweight Binance REST client. Uses raw fetch (no external SDK) so it works
 * both on Testnet and Live via a single base URL. Public endpoints don't require keys.
 */

export type Candle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
};

export type Ticker24h = {
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  lastPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
};

export function baseUrl(testnet: boolean = true) {
  return testnet ? "https://testnet.binance.vision" : "https://api.binance.com";
}

// ---------- Symbol info (tickSize, stepSize, minNotional) ----------
export type SymbolInfo = {
  symbol: string;
  tickSize: number;
  stepSize: number;
  minQty: number;
  minNotional: number;
};

type Cache = { map: Map<string, SymbolInfo>; ts: number; testnet: boolean } | null;
const g = global as any;
function getCache(): Cache {
  return (g.__NEXUS_SYMBOLS__ ??= null);
}
function setCache(c: Cache) {
  g.__NEXUS_SYMBOLS__ = c;
}

/** Loads the full /exchangeInfo once per hour and indexes symbol filters. */
async function loadExchangeInfo(testnet: boolean): Promise<Map<string, SymbolInfo>> {
  const cache = getCache();
  if (cache && cache.testnet === testnet && Date.now() - cache.ts < 60 * 60_000) {
    return cache.map;
  }
  const data = await publicGet<any>("/api/v3/exchangeInfo", {}, testnet);
  const map = new Map<string, SymbolInfo>();
  for (const s of data.symbols || []) {
    if (s.status !== "TRADING") continue;
    const f = (t: string) => (s.filters || []).find((x: any) => x.filterType === t) || {};
    const price = f("PRICE_FILTER");
    const lot = f("LOT_SIZE");
    // MIN_NOTIONAL (deprecated) OR NOTIONAL on newer endpoints
    const notional = f("NOTIONAL").minNotional ?? f("MIN_NOTIONAL").minNotional ?? "0";
    map.set(s.symbol, {
      symbol: s.symbol,
      tickSize: +(price.tickSize || "0.00000001"),
      stepSize: +(lot.stepSize || "0.00000001"),
      minQty: +(lot.minQty || "0"),
      minNotional: +notional,
    });
  }
  setCache({ map, ts: Date.now(), testnet });
  return map;
}

export async function getSymbolInfo(symbol: string, testnet = true): Promise<SymbolInfo> {
  const m = await loadExchangeInfo(testnet);
  const s = m.get(symbol);
  if (!s) throw new Error(`Unknown Binance symbol: ${symbol}`);
  return s;
}

/** Count decimals required for a tick/step (e.g. 0.001 → 3). */
export function decimalsOf(step: number): number {
  if (step >= 1) return 0;
  const s = step.toExponential();
  const [, e] = s.split("e");
  return Math.max(0, -parseInt(e, 10));
}

/** Floor a number to a multiple of step, avoiding float drift. */
export function floorToStep(value: number, step: number): number {
  if (!step || step <= 0) return value;
  const d = decimalsOf(step);
  const n = Math.floor(value / step) * step;
  return +n.toFixed(d + 2);
}

export function floorToTick(value: number, tick: number): number {
  return floorToStep(value, tick);
}

export function formatNum(value: number, step: number): string {
  const d = decimalsOf(step);
  return value.toFixed(d);
}

function sign(query: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

export async function publicGet<T = any>(path: string, params: Record<string, any> = {}, testnet = true): Promise<T> {
  const q = new URLSearchParams(params as any).toString();
  const url = `${baseUrl(testnet)}${path}${q ? "?" + q : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Binance ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------- Server time sync (fixes -1021 clock-skew errors) ----------
// We keep a per-(testnet) offset = serverTime - localTime and refresh it
// periodically. Signed requests use `Date.now() + offset` as their timestamp,
// so even if the local machine clock drifts by a few seconds, Binance accepts
// the request (within recvWindow).
type TimeSync = { offsetMs: number; fetchedAt: number };
const TIME_SYNC_TTL_MS = 10 * 60_000;
function getTimeCache(net: boolean): TimeSync | null {
  const g2 = global as any;
  const key = net ? "__NEXUS_TIME_TESTNET__" : "__NEXUS_TIME_LIVE__";
  return g2[key] || null;
}
function setTimeCache(net: boolean, v: TimeSync) {
  const g2 = global as any;
  const key = net ? "__NEXUS_TIME_TESTNET__" : "__NEXUS_TIME_LIVE__";
  g2[key] = v;
}

async function fetchServerTimeOffset(testnet: boolean): Promise<number> {
  const t0 = Date.now();
  const r = await publicGet<{ serverTime: number }>("/api/v3/time", {}, testnet);
  const t1 = Date.now();
  // Subtract half round-trip so the offset approximates the clock delta at the
  // moment the server responded, not when we received the response.
  const rtt = t1 - t0;
  return r.serverTime - (t0 + Math.floor(rtt / 2));
}

async function getServerTimeOffset(testnet: boolean): Promise<number> {
  const cached = getTimeCache(testnet);
  if (cached && Date.now() - cached.fetchedAt < TIME_SYNC_TTL_MS) {
    return cached.offsetMs;
  }
  try {
    const offsetMs = await fetchServerTimeOffset(testnet);
    setTimeCache(testnet, { offsetMs, fetchedAt: Date.now() });
    return offsetMs;
  } catch {
    return cached?.offsetMs ?? 0;
  }
}

export async function signedRequest<T = any>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: Record<string, any> = {},
  opts: { apiKey?: string; apiSecret?: string; testnet?: boolean } = {}
): Promise<T> {
  const apiKey = opts.apiKey ?? process.env.BINANCE_API_KEY ?? "";
  const apiSecret = opts.apiSecret ?? process.env.BINANCE_API_SECRET ?? "";
  const testnet = opts.testnet ?? (process.env.BINANCE_TESTNET || "true") === "true";
  if (!apiKey || !apiSecret) throw new Error("Missing Binance API key/secret");

  const doCall = async (retriedAfterSkew: boolean): Promise<T> => {
    const offset = await getServerTimeOffset(testnet);
    const ts = Date.now() + offset;
    const q = new URLSearchParams({ ...params, timestamp: String(ts), recvWindow: "30000" }).toString();
    const sig = sign(q, apiSecret);
    const url = `${baseUrl(testnet)}${path}?${q}&signature=${sig}`;
    const res = await fetch(url, { method, headers: { "X-MBX-APIKEY": apiKey }, cache: "no-store" });
    if (res.ok) return res.json();
    const body = await res.text();
    // If the clock drifted between cache refreshes, Binance returns -1021.
    // Invalidate the cache, refresh, and retry exactly once.
    if (!retriedAfterSkew && (body.includes("-1021") || body.includes("recvWindow") || body.includes("Timestamp"))) {
      setTimeCache(testnet, { offsetMs: 0, fetchedAt: 0 });
      return doCall(true);
    }
    throw new Error(`Binance ${path} ${res.status}: ${body}`);
  };

  return doCall(false);
}

export async function fetchCandles(symbol: string, interval: KlineInterval = "1h", limit = 100, testnet = true): Promise<Candle[]> {
  const data = (await publicGet<any[]>("/api/v3/klines", { symbol, interval, limit }, testnet)) as any[];
  return data.map((c) => ({
    openTime: c[0],
    open: +c[1],
    high: +c[2],
    low: +c[3],
    close: +c[4],
    volume: +c[5],
    closeTime: c[6],
  }));
}

export async function fetch24h(symbol: string, testnet = true): Promise<Ticker24h> {
  const d = await publicGet<any>("/api/v3/ticker/24hr", { symbol }, testnet);
  return {
    symbol: d.symbol,
    priceChange: +d.priceChange,
    priceChangePercent: +d.priceChangePercent,
    lastPrice: +d.lastPrice,
    highPrice: +d.highPrice,
    lowPrice: +d.lowPrice,
    volume: +d.volume,
    quoteVolume: +d.quoteVolume,
  };
}

export async function fetchAll24h(testnet = true): Promise<Ticker24h[]> {
  const d = await publicGet<any[]>("/api/v3/ticker/24hr", {}, testnet);
  return d.map((x: any) => ({
    symbol: x.symbol,
    priceChange: +x.priceChange,
    priceChangePercent: +x.priceChangePercent,
    lastPrice: +x.lastPrice,
    highPrice: +x.highPrice,
    lowPrice: +x.lowPrice,
    volume: +x.volume,
    quoteVolume: +x.quoteVolume,
  }));
}

export async function fetchPrice(symbol: string, testnet = true): Promise<number> {
  const r = await publicGet<any>("/api/v3/ticker/price", { symbol }, testnet);
  return +r.price;
}

/** Picks top N USDC pairs by 24h quote volume, excluding stablecoins. */
export async function topUsdcPairs(n = 50, testnet = true): Promise<Ticker24h[]> {
  const all = await fetchAll24h(testnet);
  const stables = /^(USDT|USDC|BUSD|TUSD|FDUSD|DAI|USDP|PYUSD|USDE|EUR|TRY|GBP)USDC$/i;
  /** Testnet often has thin books — use a lower floor so the scan list is not empty. */
  const minQuoteVolume = testnet ? 100_000 : 1_000_000;
  const filtered = all
    .filter((t) => t.symbol.endsWith("USDC"))
    .filter((t) => !stables.test(t.symbol))
    .filter((t) => t.lastPrice >= 0.001)
    .filter((t) => t.quoteVolume >= minQuoteVolume)
    .sort((a, b) => b.quoteVolume - a.quoteVolume);
  return filtered.slice(0, n);
}

export async function getAccount(testnet = true, apiKey?: string, apiSecret?: string) {
  return signedRequest<any>("GET", "/api/v3/account", {}, { testnet, apiKey, apiSecret });
}

/** Market BUY order using quote asset quantity (USDC). */
export async function marketBuyQuote(symbol: string, quoteQty: number, testnet = true) {
  const info = await getSymbolInfo(symbol, testnet);
  if (quoteQty < info.minNotional) {
    throw new Error(`Order size $${quoteQty} below minNotional $${info.minNotional} for ${symbol}`);
  }
  return signedRequest<any>(
    "POST",
    "/api/v3/order",
    { symbol, side: "BUY", type: "MARKET", quoteOrderQty: quoteQty.toFixed(2) },
    { testnet }
  );
}

export async function marketSell(symbol: string, quantity: number, testnet = true) {
  const info = await getSymbolInfo(symbol, testnet);
  const qty = floorToStep(quantity, info.stepSize);
  return signedRequest<any>(
    "POST",
    "/api/v3/order",
    { symbol, side: "SELL", type: "MARKET", quantity: formatNum(qty, info.stepSize) },
    { testnet }
  );
}

export async function placeOco(
  symbol: string,
  quantity: number,
  takeProfit: number,
  stopLoss: number,
  testnet = true
) {
  const info = await getSymbolInfo(symbol, testnet);
  const qty = floorToStep(quantity, info.stepSize);
  // TP must be > market price (SELL OCO). Snap down to tick.
  const tpPrice = floorToTick(takeProfit, info.tickSize);
  // Stop must be < market. Snap up to tick to keep above a reasonable safety.
  const stopPrice = floorToTick(stopLoss, info.tickSize);
  // stopLimit slightly below stop trigger → snap to tick.
  const stopLimitRaw = stopLoss * 0.995;
  const stopLimit = floorToTick(stopLimitRaw, info.tickSize);

  // Ensure notionals are above minNotional
  if (qty * tpPrice < info.minNotional || qty * stopPrice < info.minNotional) {
    throw new Error(
      `OCO below minNotional ${info.minNotional}: qty=${qty} tp=${tpPrice} sl=${stopPrice}`
    );
  }

  return signedRequest<any>(
    "POST",
    "/api/v3/order/oco",
    {
      symbol,
      side: "SELL",
      quantity: formatNum(qty, info.stepSize),
      price: formatNum(tpPrice, info.tickSize),
      stopPrice: formatNum(stopPrice, info.tickSize),
      stopLimitPrice: formatNum(stopLimit, info.tickSize),
      stopLimitTimeInForce: "GTC",
    },
    { testnet }
  );
}

export async function cancelOrder(symbol: string, orderId: string | number, testnet = true) {
  return signedRequest<any>("DELETE", "/api/v3/order", { symbol, orderId }, { testnet });
}

export async function cancelOco(symbol: string, orderListId: string | number, testnet = true) {
  return signedRequest<any>("DELETE", "/api/v3/orderList", { symbol, orderListId }, { testnet });
}

/** Query OCO list status (EXECUTING = active, ALL_DONE = fully filled or cancelled). */
export async function getOcoOrderList(symbol: string, orderListId: string | number, testnet = true) {
  return signedRequest<any>("GET", "/api/v3/orderList", { symbol, orderListId }, { testnet });
}

export async function getOrder(symbol: string, orderId: string | number, testnet = true) {
  return signedRequest<any>("GET", "/api/v3/order", { symbol, orderId }, { testnet });
}

export type MyTradeRow = {
  id: number;
  price: number;
  qty: number;
  quoteQty: number;
  time: number;
  isBuyer: boolean;
};

export async function fetchMyTrades(
  symbol: string,
  opts: { startTime?: number; limit?: number; testnet?: boolean } = {}
): Promise<MyTradeRow[]> {
  const testnet = opts.testnet ?? (process.env.BINANCE_TESTNET || "true") === "true";
  const params: Record<string, string | number> = { symbol, limit: opts.limit ?? 50 };
  if (opts.startTime) params.startTime = opts.startTime;
  const rows = await signedRequest<any[]>("GET", "/api/v3/myTrades", params, { testnet });
  return (rows || []).map((r) => ({
    id: r.id,
    price: +r.price,
    qty: +r.qty,
    quoteQty: +r.quoteQty || 0,
    time: r.time,
    isBuyer: r.isBuyer,
  }));
}

export async function fetchUsdcBalance(testnet = true): Promise<number> {
  try {
    const acc = await getAccount(testnet);
    const b = (acc.balances || []).find((x: any) => x.asset === "USDC");
    return b ? +b.free : 0;
  } catch {
    return 0;
  }
}

/**
 * Fetches total USDC held on Binance (free + locked). `locked` covers USDC
 * reserved by open limit/OCO orders, so this represents all cash the bot has
 * on the exchange. Throws if the account call fails so callers can react.
 */
export async function fetchUsdcCashBalance(testnet = true): Promise<{ free: number; locked: number; total: number }> {
  const acc = await getAccount(testnet);
  const b = (acc.balances || []).find((x: any) => x.asset === "USDC");
  const free = b ? +b.free || 0 : 0;
  const locked = b ? +b.locked || 0 : 0;
  return { free, locked, total: free + locked };
}

/**
 * True portfolio value in USDC, computed directly from Binance account balances
 * (the source of truth). Includes both `free` and `locked` amounts so funds
 * sitting in open OCO/limit orders are counted.
 *
 * Design for resilience:
 *   - If /account fails we throw (caller treats as unknown portfolio).
 *   - If /ticker/24hr fails, we still return USDC cash + stablecoins, so the
 *     dashboard doesn't flash to $0 when the ticker endpoint hiccups.
 *   - Each non-stable asset is priced via `*USDC` with `*USDT` fallback.
 *   - On testnet the ticker universe is small; unknown assets are counted as
 *     $0 but surfaced in the breakdown so we can debug.
 */
export async function fetchPortfolioValueUsdc(
  testnet = true
): Promise<{
  total: number;
  usdcFree: number;
  usdcLocked: number;
  assets: { asset: string; qty: number; price: number; valueUsdc: number }[];
  tickerOk: boolean;
}> {
  const STABLE_1TO1 = new Set(["USDC", "USDT", "BUSD", "FDUSD", "TUSD", "DAI", "USDP", "PYUSD"]);

  const acc = await getAccount(testnet);

  let tickers: Ticker24h[] = [];
  let tickerOk = false;
  try {
    tickers = await fetchAll24h(testnet);
    tickerOk = true;
  } catch (err) {
    console.warn("[portfolio] fetchAll24h failed, pricing stables only:", (err as Error).message);
  }
  const priceMap = new Map<string, number>();
  for (const t of tickers) priceMap.set(t.symbol, t.lastPrice);

  // Cross rates to USDC for indirect pricing (BTC->USDC, BNB->USDC, ETH->USDC).
  // This mirrors how Binance's UI estimates total wallet value: assets that
  // only trade against BTC/BNB/ETH still need to be valued. We try USDC first,
  // then USDT, since both are pegged 1:1 in practice.
  const crossToUsdc = (base: string): number =>
    priceMap.get(`${base}USDC`) ?? priceMap.get(`${base}USDT`) ?? 0;
  const btcUsdc = crossToUsdc("BTC");
  const bnbUsdc = crossToUsdc("BNB");
  const ethUsdc = crossToUsdc("ETH");

  function priceAssetUsdc(asset: string): number {
    if (STABLE_1TO1.has(asset)) return 1;
    if (!tickerOk) return 0;
    const direct = priceMap.get(`${asset}USDC`) ?? priceMap.get(`${asset}USDT`);
    if (direct) return direct;
    const inBtc = priceMap.get(`${asset}BTC`);
    if (inBtc && btcUsdc) return inBtc * btcUsdc;
    const inBnb = priceMap.get(`${asset}BNB`);
    if (inBnb && bnbUsdc) return inBnb * bnbUsdc;
    const inEth = priceMap.get(`${asset}ETH`);
    if (inEth && ethUsdc) return inEth * ethUsdc;
    return 0;
  }

  let usdcFree = 0;
  let usdcLocked = 0;
  const assets: { asset: string; qty: number; price: number; valueUsdc: number }[] = [];

  for (const b of acc.balances || []) {
    const free = +b.free || 0;
    const locked = +b.locked || 0;
    const qty = free + locked;
    if (qty <= 0) continue;

    if (b.asset === "USDC") {
      usdcFree = free;
      usdcLocked = locked;
      assets.push({ asset: "USDC", qty, price: 1, valueUsdc: qty });
      continue;
    }

    const price = priceAssetUsdc(b.asset);
    const valueUsdc = qty * price;
    // Always include the row (no dust filter) — Binance's wallet total counts
    // every cent. Unknown-price assets show with price=0 so they're visible
    // in the breakdown for debugging without distorting the total.
    assets.push({ asset: b.asset, qty, price, valueUsdc });
  }

  const total = assets.reduce((a, x) => a + x.valueUsdc, 0);
  return { total, usdcFree, usdcLocked, assets, tickerOk };
}

/** Free balance for a single asset (e.g. "BTC", "SOL"). Returns 0 if asset missing or call fails. */
export async function fetchFreeBalance(asset: string, testnet = true): Promise<number> {
  try {
    const acc = await getAccount(testnet);
    const b = (acc.balances || []).find((x: any) => x.asset === asset);
    return b ? +b.free : 0;
  } catch {
    return 0;
  }
}

/**
 * Total balance (free + locked) for a single asset. Throws on failure so the
 * caller can react (e.g. reconciliation must NOT treat an unknown balance as
 * "missing"). `locked` covers funds reserved by open OCO/limit orders, which
 * are still ours — they just can't be moved freely.
 */
export async function fetchAssetBalance(
  asset: string,
  testnet = true
): Promise<{ free: number; locked: number; total: number }> {
  const acc = await getAccount(testnet);
  const b = (acc.balances || []).find((x: any) => x.asset === asset);
  const free = b ? +b.free || 0 : 0;
  const locked = b ? +b.locked || 0 : 0;
  return { free, locked, total: free + locked };
}

/** Derive the base asset from a trading pair (e.g. "SOLUSDC" → "SOL"). */
export function baseAssetOf(symbol: string): string {
  const quotes = ["USDC", "USDT", "BUSD", "FDUSD", "BTC", "ETH", "BNB", "EUR", "TRY", "GBP"];
  for (const q of quotes) if (symbol.endsWith(q)) return symbol.slice(0, -q.length);
  return symbol;
}
