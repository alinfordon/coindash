import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const pair = searchParams.get("pair");
  const outcome = searchParams.get("outcome"); // "profit" | "loss"
  const aiModel = searchParams.get("aiModel");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(+(searchParams.get("limit") || 200), 1000);

  const q: any = { status: "CLOSED" };
  if (pair) q.pair = pair;
  if (aiModel) q.aiModel = aiModel;
  if (from || to) {
    q.closedAt = {} as any;
    if (from) q.closedAt.$gte = new Date(from);
    if (to) q.closedAt.$lte = new Date(to);
  }
  if (outcome === "profit") q.pnlUsdc = { $gt: 0 };
  if (outcome === "loss") q.pnlUsdc = { $lt: 0 };

  const trades = await Trade.find(q).sort({ closedAt: -1 }).limit(limit).lean();

  // Stats
  const total = trades.length;
  const wins = trades.filter((t) => (t.pnlUsdc || 0) > 0);
  const losses = trades.filter((t) => (t.pnlUsdc || 0) < 0);
  const winRate = total > 0 ? (wins.length / total) * 100 : 0;
  const avgProfit = wins.length ? wins.reduce((a, t) => a + (t.pnlUsdc || 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + (t.pnlUsdc || 0), 0) / losses.length : 0;
  const largestWin = wins.reduce((m, t) => Math.max(m, t.pnlUsdc || 0), 0);
  const largestLoss = losses.reduce((m, t) => Math.min(m, t.pnlUsdc || 0), 0);
  const returns = trades.map((t) => t.pnlPercent || 0);
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length : 0;
  const sharpe = variance > 0 ? mean / Math.sqrt(variance) : 0;

  return NextResponse.json({
    trades,
    stats: {
      total,
      winRate: +winRate.toFixed(2),
      avgProfit: +avgProfit.toFixed(4),
      avgLoss: +avgLoss.toFixed(4),
      largestWin: +largestWin.toFixed(4),
      largestLoss: +largestLoss.toFixed(4),
      sharpe: +sharpe.toFixed(3),
    },
  });
}
