import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { dashboardClosedTradeMatch } from "@/lib/dashboardTrades";

export const dynamic = "force-dynamic";

export async function GET() {
  await connectDB();
  const trades = await Trade.find(dashboardClosedTradeMatch()).sort({ closedAt: -1 }).limit(200).lean();
  const map = new Map<string, { pair: string; pnl: number; trades: number; spark: number[] }>();
  for (const t of trades) {
    const key = String(t.pair);
    const entry = map.get(key) || { pair: key, pnl: 0, trades: 0, spark: [] };
    entry.pnl += t.pnlUsdc || 0;
    entry.trades += 1;
    entry.spark.push(t.pnlPercent || 0);
    map.set(key, entry);
  }
  const list = Array.from(map.values())
    .map((x) => ({ ...x, pnl: +x.pnl.toFixed(4), spark: x.spark.slice(0, 20).reverse() }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 8);
  return NextResponse.json({ pairs: list });
}
