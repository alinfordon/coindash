import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { AILog } from "@/models/AILog";

export const dynamic = "force-dynamic";

/**
 * Restores trades that were wrongly closed by the reconciliation routine.
 *
 * Use this if the reconciler over-closed positions (e.g. it counted only the
 * `free` balance and ignored funds locked in OCO orders). It reverts every
 * trade closed via `RECONCILED` within the last `minutesBack` minutes (default
 * 60) back to status `OPEN`.
 *
 * Body: { minutesBack?: number, tradeIds?: string[] }
 */
export async function POST(req: Request) {
  await connectDB();
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty */
  }
  const minutesBack = Number(body.minutesBack) > 0 ? Number(body.minutesBack) : 60;
  const tradeIds: string[] | undefined = Array.isArray(body.tradeIds) ? body.tradeIds : undefined;

  const since = new Date(Date.now() - minutesBack * 60 * 1000);

  const filter: any = {
    status: "CLOSED",
    closedReason: "RECONCILED",
    closedAt: { $gte: since },
  };
  if (tradeIds && tradeIds.length > 0) filter._id = { $in: tradeIds };

  const trades = await Trade.find(filter).lean();

  const restored: any[] = [];
  for (const t of trades) {
    await Trade.findByIdAndUpdate(t._id, {
      $set: { status: "OPEN" },
      $unset: { exitPrice: "", closedAt: "", closedReason: "", pnlUsdc: "", pnlPercent: "" },
    });
    await AILog.create({
      action: "RECONCILE",
      pair: t.pair,
      decision: "RESTORED",
      reasoning: `Manually restored after wrongful reconciliation closure (was: ${t.closedReason}).`,
      executedTrade: false,
      tradeId: t._id,
    });
    restored.push({ pair: t.pair, tradeId: String(t._id) });
  }

  return NextResponse.json({
    ok: true,
    restoredCount: restored.length,
    restored,
    minutesBack,
  });
}
