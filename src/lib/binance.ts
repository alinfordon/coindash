import crypto from "crypto";

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
  const ts = Date.now();
  const q = new URLSearchParams({ ...params, timestamp: String(ts), recvWindow: "10000" }).toString();
  const sig = sign(q, apiSecret);
  const url = `${baseUrl(testnet)}${path}?${q}&signature=${sig}`;
  const res = await fetch(url, { method, headers: { "X-MBX-APIKEY": apiKey }, cache: "no-store" });
  if (!res.ok) throw new Error(`Binance ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchCandles(symbol: string, interval: "1h" | "15m" | "5m" | "1m" = "1h", limit = 100, testnet = true): Promise<Candle[]> {
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
  const filtered = all
    .filter((t) => t.symbol.endsWith("USDC"))
    .filter((t) => !stables.test(t.symbol))
    .filter((t) => t.lastPrice >= 0.001)
    .filter((t) => t.quoteVolume >= 1_000_000)
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

export async function fetchUsdcBalance(testnet = true): Promise<number> {
  try {
    const acc = await getAccount(testnet);
    const b = (acc.balances || []).find((x: any) => x.asset === "USDC");
    return b ? +b.free : 0;
  } catch {
    return 0;
  }
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

/** Derive the base asset from a trading pair (e.g. "SOLUSDC" → "SOL"). */
export function baseAssetOf(symbol: string): string {
  const quotes = ["USDC", "USDT", "BUSD", "FDUSD", "BTC", "ETH", "BNB", "EUR", "TRY", "GBP"];
  for (const q of quotes) if (symbol.endsWith(q)) return symbol.slice(0, -q.length);
  return symbol;
}
