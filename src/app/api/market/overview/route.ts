import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { fetchAll24h } from "@/lib/binance";

export const dynamic = "force-dynamic";

let feargreedCache: { ts: number; value: number; classification: string } | null = null;

async function getFearGreed() {
  if (feargreedCache && Date.now() - feargreedCache.ts < 30 * 60_000) return feargreedCache;
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", { cache: "no-store" });
    const j = await r.json();
    const d = j?.data?.[0];
    if (d) {
      feargreedCache = { ts: Date.now(), value: +d.value, classification: d.value_classification };
      return feargreedCache;
    }
  } catch {}
  return { ts: Date.now(), value: 50, classification: "Neutral" };
}

export async function GET() {
  const settings = await getSettings();
  let all: any[] = [];
  try {
    all = await fetchAll24h(settings.binanceTestnet);
  } catch {}
  const usdc = all.filter((t) => t.symbol.endsWith("USDC"));

  const btc = usdc.find((t) => t.symbol === "BTCUSDC") || null;
  const topGainers = [...usdc].sort((a, b) => b.priceChangePercent - a.priceChangePercent).slice(0, 5);
  const topLosers = [...usdc].sort((a, b) => a.priceChangePercent - b.priceChangePercent).slice(0, 5);

  // Rough BTC dominance proxy via top USDC volume share
  const totalVol = usdc.reduce((a, t) => a + t.quoteVolume, 0);
  const btcDominance = btc && totalVol > 0 ? (btc.quoteVolume / totalVol) * 100 : null;

  const fg = await getFearGreed();

  return NextResponse.json({
    btc: btc ? { price: btc.lastPrice, change24h: btc.priceChangePercent } : null,
    btcDominanceApprox: btcDominance ? +btcDominance.toFixed(2) : null,
    fearGreed: fg,
    topGainers: topGainers.map((t) => ({ symbol: t.symbol, change: t.priceChangePercent, price: t.lastPrice })),
    topLosers: topLosers.map((t) => ({ symbol: t.symbol, change: t.priceChangePercent, price: t.lastPrice })),
  });
}
