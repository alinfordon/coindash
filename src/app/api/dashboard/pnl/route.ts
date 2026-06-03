import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { dashboardClosedTradeMatch } from "@/lib/dashboardTrades";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
  await connectDB();
  const userId = await getApiUserId();
  const { searchParams } = new URL(req.url);
  const period = (searchParams.get("period") || "24h").toLowerCase();
  const now = Date.now();

  let since: Date;
  let bucketMs: number;
  switch (period) {
    case "1h":
      since = new Date(now - 3600_000);
      bucketMs = 60_000; // minute
      break;
    case "7d":
      since = new Date(now - 7 * 86400_000);
      bucketMs = 3600_000; // hour
      break;
    case "30d":
      since = new Date(now - 30 * 86400_000);
      bucketMs = 6 * 3600_000;
      break;
    case "24h":
    default:
      since = new Date(now - 24 * 3600_000);
      bucketMs = 15 * 60_000;
  }

  const trades = await Trade.find({ ...dashboardClosedTradeMatch(userId), closedAt: { $gte: since } })
    .sort({ closedAt: 1 })
    .lean();

  // Build buckets
  const numBuckets = Math.ceil((now - since.getTime()) / bucketMs);
  const buckets: { t: number; pnl: number; cum: number; trades: number }[] = [];
  for (let i = 0; i < numBuckets; i++) {
    buckets.push({ t: since.getTime() + i * bucketMs, pnl: 0, cum: 0, trades: 0 });
  }
  for (const t of trades) {
    const idx = Math.floor((new Date(t.closedAt as Date).getTime() - since.getTime()) / bucketMs);
    if (idx >= 0 && idx < buckets.length) {
      buckets[idx].pnl += t.pnlUsdc || 0;
      buckets[idx].trades += 1;
    }
  }
  let cum = 0;
  for (const b of buckets) {
    cum += b.pnl;
    b.cum = +cum.toFixed(4);
    b.pnl = +b.pnl.toFixed(4);
  }

  return NextResponse.json({ period, series: buckets });
  } catch (e) {
    return apiError(e);
  }
}
