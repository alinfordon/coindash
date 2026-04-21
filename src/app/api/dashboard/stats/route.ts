import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { getSettings } from "@/lib/settings";
import { fetchPrice, fetchUsdcBalance } from "@/lib/binance";

export const dynamic = "force-dynamic";

export async function GET() {
  await connectDB();
  const settings = await getSettings();

  const [openTrades, closedTrades24h, allClosed] = await Promise.all([
    Trade.find({ status: "OPEN" }).lean(),
    Trade.find({ status: "CLOSED", closedAt: { $gte: new Date(Date.now() - 24 * 3600_000) } }).lean(),
    Trade.find({ status: "CLOSED" }).lean(),
  ]);

  // Live mark-to-market for open positions (best-effort)
  let openValue = 0;
  let openUnrealized = 0;
  for (const t of openTrades) {
    try {
      const p = await fetchPrice(t.pair as string, settings.binanceTestnet);
      openValue += (p as number) * (t.quantity as number);
      openUnrealized += (p - (t.entryPrice as number)) * (t.quantity as number);
    } catch {
      openValue += (t.usdcValue as number) || 0;
    }
  }

  const realized24h = closedTrades24h.reduce((a, t) => a + (t.pnlUsdc || 0), 0);
  const realizedTotal = allClosed.reduce((a, t) => a + (t.pnlUsdc || 0), 0);

  const wins = allClosed.filter((t) => (t.pnlUsdc || 0) > 0).length;
  const winRate = allClosed.length > 0 ? (wins / allClosed.length) * 100 : 0;

  let usdcBalance = 0;
  try {
    usdcBalance = await fetchUsdcBalance(settings.binanceTestnet);
  } catch {
    /* ignore */
  }

  return NextResponse.json({
    portfolioValueUsdc: +(usdcBalance + openValue).toFixed(4),
    usdcBalance: +usdcBalance.toFixed(4),
    openValue: +openValue.toFixed(4),
    pnl24hUsdc: +(realized24h + openUnrealized).toFixed(4),
    pnl24hPercent: usdcBalance + openValue > 0 ? +(((realized24h + openUnrealized) / (usdcBalance + openValue)) * 100).toFixed(4) : 0,
    realizedTotal: +realizedTotal.toFixed(4),
    openPositions: openTrades.length,
    winRate: +winRate.toFixed(2),
    totalTrades: allClosed.length,
    pilotActive: settings.pilotActive,
    analysisCronActive: settings.analysisCronActive,
    positionCheckCronActive: settings.positionCheckCronActive,
    dryRun: settings.dryRun,
  });
}
