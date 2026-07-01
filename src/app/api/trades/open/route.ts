import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { getSettings } from "@/lib/settings";
import { getExchangeAdapterForTrade } from "@/lib/exchange";
import { userScope } from "@/lib/tenant";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
  await connectDB();
  const userId = await getApiUserId();
  const settings = await getSettings(userId);
  const trades = await Trade.find(userScope(userId, { status: "OPEN" })).sort({ openedAt: -1 }).lean();
  const out = [];
  for (const t of trades) {
    let price = t.entryPrice as number;
    try {
      const tex = getExchangeAdapterForTrade(settings, t);
      price = await tex.fetchPrice(t.pair as string, (t.assetClass as any) || "crypto");
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
  } catch (e) {
    return apiError(e);
  }
}
