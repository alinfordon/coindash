import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { dashboardClosedTradeMatch } from "@/lib/dashboardTrades";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

/**
 * Returns every closed trade in the requested period, one entry per trade,
 * suitable for a per-trade line/bar chart (green = profit, red = loss).
 * Periods: 1d | 7d | 30d | 1y.
 */
export async function GET(req: Request) {
  try {
  await connectDB();
  const userId = await getApiUserId();
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") || "1d").toLowerCase();

  const now = Date.now();
  let since: Date;
  switch (period) {
    case "7d":
      since = new Date(now - 7 * 86400_000);
      break;
    case "30d":
      since = new Date(now - 30 * 86400_000);
      break;
    case "1y":
      since = new Date(now - 365 * 86400_000);
      break;
    case "1d":
    default:
      since = new Date(now - 86400_000);
  }

  const trades = await Trade.find({ ...dashboardClosedTradeMatch(userId), closedAt: { $gte: since } })
    .sort({ closedAt: 1 })
    .lean();

  const series = trades.map((t) => ({
    t: new Date(t.closedAt as Date).getTime(),
    pair: t.pair as string,
    pnl: +(+(t.pnlUsdc || 0)).toFixed(4),
    pnlPct: +(+(t.pnlPercent || 0)).toFixed(4),
    reason: (t.closedReason as string) || "",
  }));

  const wins = series.filter((s) => s.pnl > 0).length;
  const losses = series.filter((s) => s.pnl < 0).length;
  const totalPnl = +series.reduce((a, s) => a + s.pnl, 0).toFixed(4);

  return NextResponse.json({ period, series, wins, losses, totalPnl });
  } catch (e) {
    return apiError(e);
  }
}
