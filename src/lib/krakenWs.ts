/** Client-safe Kraken WebSocket v2 helpers (OHLC live feed). */

export const KRAKEN_WS_V2 = "wss://ws.kraken.com/v2";

const INTERVAL_MINUTES: Record<string, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "1d": 1440,
  "3d": 4320,
};

/** Kraken WS v2 supports 1,5,15,30,60,240,1440,10080,21600 — not 3d (4320). */
export function krakenWsIntervalMinutes(interval: string): number | null {
  const m = INTERVAL_MINUTES[interval];
  if (m == null || m === 4320) return null;
  return m;
}

export function guessKrakenAssetClass(symbol: string): "crypto" | "tokenized_asset" {
  return /x(USD|USDC|USDT|EUR)$/i.test(symbol) ? "tokenized_asset" : "crypto";
}

export function symbolToKrakenWsName(symbol: string): string {
  const m = symbol.match(/^(.+?)(USD|USDC|USDT|EUR)$/i);
  if (m) return `${m[1]}/${m[2]!.toUpperCase()}`;
  return symbol;
}

export function krakenOhlcSubscribe(wsSymbol: string, intervalMinutes: number): string {
  return JSON.stringify({
    method: "subscribe",
    params: {
      channel: "ohlc",
      symbol: [wsSymbol],
      interval: intervalMinutes,
      snapshot: true,
    },
  });
}

export function krakenPingMessage(): string {
  return JSON.stringify({ method: "ping" });
}

export type KrakenOhlcTick = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export function parseKrakenOhlcV2Message(raw: string): KrakenOhlcTick[] {
  try {
    const msg = JSON.parse(raw) as {
      channel?: string;
      type?: string;
      method?: string;
      data?: Array<Record<string, unknown>>;
    };
    if (msg.method === "pong" || msg.channel === "heartbeat") return [];
    if (msg.channel !== "ohlc") return [];
    if (msg.type !== "update" && msg.type !== "snapshot") return [];
    if (!Array.isArray(msg.data)) return [];

    const out: KrakenOhlcTick[] = [];
    for (const d of msg.data) {
      const begin = d.interval_begin ?? d.timestamp;
      if (begin == null) continue;
      const ms =
        typeof begin === "number"
          ? begin > 1e12
            ? begin
            : begin * 1000
          : new Date(String(begin)).getTime();
      const time = Math.floor(ms / 1000);
      if (!Number.isFinite(time) || time <= 0) continue;
      out.push({
        time,
        open: +d.open!,
        high: +d.high!,
        low: +d.low!,
        close: +d.close!,
      });
    }
    return out;
  } catch {
    return [];
  }
}
