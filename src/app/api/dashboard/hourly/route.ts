import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { dashboardClosedTradeMatch } from "@/lib/dashboardTrades";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const now = Date.now();
    const since = now - 24 * 3600_000;
    const trades = await Trade.find({
      ...dashboardClosedTradeMatch(userId),
      closedAt: { $gte: new Date(since) },
    }).lean();
    const hours: { hour: number; pnl: number; label: string }[] = [];
    for (let i = 0; i < 24; i++) {
      const t = since + i * 3600_000;
      const d = new Date(t);
      hours.push({ hour: t, pnl: 0, label: `${String(d.getHours()).padStart(2, "0")}:00` });
    }
    for (const t of trades) {
      const idx = Math.floor((new Date(t.closedAt as Date).getTime() - since) / 3600_000);
      if (idx >= 0 && idx < 24) hours[idx].pnl += t.pnlUsdc || 0;
    }
    return NextResponse.json({ hours: hours.map((h) => ({ ...h, pnl: +h.pnl.toFixed(4) })) });
  } catch (e) {
    return apiError(e);
  }
}
