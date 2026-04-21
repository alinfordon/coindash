import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";

export const dynamic = "force-dynamic";

export async function GET() {
  await connectDB();
  const days = 30;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const since = now.getTime() - (days - 1) * 86400_000;
  const trades = await Trade.find({ status: "CLOSED", closedAt: { $gte: new Date(since) } }).lean();
  const cells: { day: string; ts: number; pnl: number; trades: number }[] = [];
  for (let i = 0; i < days; i++) {
    const t = since + i * 86400_000;
    const d = new Date(t);
    cells.push({
      day: d.toISOString().slice(0, 10),
      ts: t,
      pnl: 0,
      trades: 0,
    });
  }
  for (const t of trades) {
    const d = new Date(t.closedAt as Date);
    d.setHours(0, 0, 0, 0);
    const idx = Math.floor((d.getTime() - since) / 86400_000);
    if (idx >= 0 && idx < days) {
      cells[idx].pnl += t.pnlUsdc || 0;
      cells[idx].trades += 1;
    }
  }
  return NextResponse.json({ cells: cells.map((c) => ({ ...c, pnl: +c.pnl.toFixed(4) })) });
}
