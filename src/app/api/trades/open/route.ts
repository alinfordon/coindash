import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { getSettings } from "@/lib/settings";
import { fetchPrice } from "@/lib/binance";

export const dynamic = "force-dynamic";

export async function GET() {
  await connectDB();
  const settings = await getSettings();
  const trades = await Trade.find({ status: "OPEN" }).sort({ openedAt: -1 }).lean();
  const out = [];
  for (const t of trades) {
    let price = t.entryPrice as number;
    try {
      price = await fetchPrice(t.pair as string, settings.binanceTestnet);
    } catch {
      /* use last-known entry */
    }
    const qty = t.quantity as number;
    const entry = t.entryPrice as number;
    const pnlUsdc = (price - entry) * qty;
    const pnlPct = ((price - entry) / entry) * 100;
    out.push({
      ...t,
      currentPrice: price,
      pnlUsdc: +pnlUsdc.toFixed(4),
      pnlPercent: +pnlPct.toFixed(4),
      durationMs: Date.now() - new Date(t.openedAt as Date).getTime(),
    });
  }
  return NextResponse.json({ trades: out });
}
