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
  const pair = searchParams.get("pair");
  const outcome = searchParams.get("outcome"); // "profit" | "loss"
  const aiModel = searchParams.get("aiModel");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const closedReason = searchParams.get("closedReason");
  const limit = Math.min(Math.max(1, +(searchParams.get("limit") || 25) || 25), 100);

  const q: Record<string, unknown> = { ...dashboardClosedTradeMatch(userId) };
  if (pair) q.pair = pair;
  if (aiModel) q.aiModel = aiModel;
  if (from || to) {
    const closedAt: Record<string, Date> = {};
    if (from) closedAt.$gte = new Date(from + (from.includes("T") ? "" : "T00:00:00.000Z"));
    if (to) closedAt.$lte = new Date(to + (to.includes("T") ? "" : "T23:59:59.999Z"));
    q.closedAt = closedAt;
  }
  if (outcome === "profit") q.pnlUsdc = { $gt: 0 };
  if (outcome === "loss") q.pnlUsdc = { $lt: 0 };
  if (closedReason) q.closedReason = closedReason;

  const page = Math.max(1, +(searchParams.get("page") || 1) || 1);

  const statsPipeline = [
    { $match: q },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        winCount: { $sum: { $cond: [{ $gt: ["$pnlUsdc", 0] }, 1, 0] } },
        lossCount: { $sum: { $cond: [{ $lt: ["$pnlUsdc", 0] }, 1, 0] } },
        sumWinPnl: { $sum: { $cond: [{ $gt: ["$pnlUsdc", 0] }, "$pnlUsdc", 0] } },
        sumLossPnl: { $sum: { $cond: [{ $lt: ["$pnlUsdc", 0] }, "$pnlUsdc", 0] } },
        netPnl: { $sum: { $ifNull: ["$pnlUsdc", 0] } },
        largestWin: { $max: { $cond: [{ $gt: ["$pnlUsdc", 0] }, "$pnlUsdc", null] } },
        largestLoss: { $min: { $cond: [{ $lt: ["$pnlUsdc", 0] }, "$pnlUsdc", null] } },
        meanPct: { $avg: { $ifNull: ["$pnlPercent", 0] } },
        stdPct: { $stdDevPop: { $ifNull: ["$pnlPercent", 0] } },
        reconciledCount: { $sum: { $cond: [{ $eq: ["$closedReason", "RECONCILED"] }, 1, 0] } },
        tpCount: { $sum: { $cond: [{ $eq: ["$closedReason", "TP_HIT"] }, 1, 0] } },
        slCount: { $sum: { $cond: [{ $eq: ["$closedReason", "SL_HIT"] }, 1, 0] } },
      },
    },
  ];

  const skip = (page - 1) * limit;

  const [trades, statsAgg] = await Promise.all([
    Trade.find(q).sort({ closedAt: -1 }).skip(skip).limit(limit).lean(),
    Trade.aggregate(statsPipeline),
  ]);

  const s = statsAgg[0];
  const total = s?.total ?? 0;
  const winCount = s?.winCount ?? 0;
  const lossCount = s?.lossCount ?? 0;
  const winRate = total > 0 ? (winCount / total) * 100 : 0;
  const avgProfit = winCount ? (s!.sumWinPnl as number) / winCount : 0;
  const avgLoss = lossCount ? (s!.sumLossPnl as number) / lossCount : 0;
  const largestWin = s?.largestWin ?? 0;
  const largestLoss = s?.largestLoss ?? 0;
  const netPnl = s?.netPnl ?? 0;
  const stdPct = s?.stdPct ?? 0;
  const sharpe = stdPct > 0 ? ((s?.meanPct as number) || 0) / stdPct : 0;

  const totalPages = total ? Math.ceil(total / limit) : 0;

  return NextResponse.json({
    trades,
    pagination: { page, limit, total, totalPages },
    stats: {
      total,
      netPnl: +Number(netPnl).toFixed(4),
      winRate: +winRate.toFixed(2),
      avgProfit: +avgProfit.toFixed(4),
      avgLoss: +avgLoss.toFixed(4),
      largestWin: +Number(largestWin || 0).toFixed(4),
      largestLoss: +Number(largestLoss || 0).toFixed(4),
      sharpe: +sharpe.toFixed(3),
      reconciledCount: s?.reconciledCount ?? 0,
      tpCount: s?.tpCount ?? 0,
      slCount: s?.slCount ?? 0,
    },
  });
  } catch (e) {
    return apiError(e);
  }
}
