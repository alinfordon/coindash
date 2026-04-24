import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { Settings } from "@/models/Settings";
import { getSettings } from "@/lib/settings";
import { fetchPortfolioValueUsdc, fetchPrice } from "@/lib/binance";
import { startOfDayInTz } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Dashboard stats. Portfolio Value is taken directly from Binance — sum of
 * every asset (free+locked) priced in USDC. This is the ground truth and
 * matches exactly what the user sees on Binance. We also persist the last
 * successful value in Settings so the UI can fall back to a snapshot if a
 * single call happens to fail.
 */
export async function GET() {
  await connectDB();
  const settings = await getSettings();

  // "Today" = from midnight in the user-configured timezone until now.
  // Defaults to Europe/Bucharest so the window matches the user's wall clock
  // regardless of where the server is running.
  const tz = settings.displayTimezone || "Europe/Bucharest";
  const startOfToday = startOfDayInTz(new Date(), tz);

  const [openTrades, closedToday, allClosed] = await Promise.all([
    Trade.find({ status: "OPEN" }).lean(),
    Trade.find({ status: "CLOSED", closedAt: { $gte: startOfToday } }).lean(),
    Trade.find({ status: "CLOSED" }).lean(),
  ]);

  // Unrealized P&L for open trades needs entry price → always derived from DB.
  let openUnrealized = 0;
  for (const t of openTrades) {
    try {
      const p = await fetchPrice(t.pair as string, settings.binanceTestnet);
      openUnrealized += (p - (t.entryPrice as number)) * (t.quantity as number);
    } catch {
      /* skip this position's MTM if price lookup fails */
    }
  }

  const realizedToday = closedToday.reduce((a, t) => a + (t.pnlUsdc || 0), 0);
  const realizedTotal = allClosed.reduce((a, t) => a + (t.pnlUsdc || 0), 0);

  const wins = allClosed.filter((t) => (t.pnlUsdc || 0) > 0).length;
  const winRate = allClosed.length > 0 ? (wins / allClosed.length) * 100 : 0;

  // Portfolio Value — live from Binance. Falls back to last snapshot on error.
  let portfolioValue = settings.cashBalanceUsdc || 0;
  let cashBalanceUpdatedAt = settings.cashBalanceUpdatedAt || null;
  let portfolioStale = true;
  let portfolioError: string | null = null;
  try {
    const pv = await fetchPortfolioValueUsdc(settings.binanceTestnet);
    portfolioValue = pv.total;
    cashBalanceUpdatedAt = new Date();
    portfolioStale = false;
    // Persist as the new snapshot so next request has a fresh fallback.
    await Settings.findOneAndUpdate(
      {},
      { $set: { cashBalanceUsdc: pv.total, cashBalanceUpdatedAt } },
      { upsert: true }
    );
  } catch (err: any) {
    portfolioError = err?.message?.slice(0, 300) || "portfolio fetch failed";
    console.warn("[dashboard/stats] live portfolio failed, using snapshot:", portfolioError);
  }

  return NextResponse.json({
    portfolioValueUsdc: +portfolioValue.toFixed(4),
    cashBalanceUpdatedAt,
    portfolioStale,
    portfolioError,
    pnlTodayUsdc: +(realizedToday + openUnrealized).toFixed(4),
    pnlTodayPercent:
      portfolioValue > 0
        ? +(((realizedToday + openUnrealized) / portfolioValue) * 100).toFixed(4)
        : 0,
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
