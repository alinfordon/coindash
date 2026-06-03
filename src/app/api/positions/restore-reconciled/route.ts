import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { AILog } from "@/models/AILog";
import { userScope, toObjectId } from "@/lib/tenant";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await connectDB();
    const userId = await getApiUserId();
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      /* allow empty */
    }
    const minutesBack = Number(body.minutesBack) > 0 ? Number(body.minutesBack) : 60;
    const tradeIds: string[] | undefined = Array.isArray(body.tradeIds) ? body.tradeIds : undefined;

    const since = new Date(Date.now() - minutesBack * 60 * 1000);

    const filter: any = userScope(userId, {
      status: "CLOSED",
      closedReason: "RECONCILED",
      closedAt: { $gte: since },
    });
    if (tradeIds && tradeIds.length > 0) filter._id = { $in: tradeIds };

    const trades = await Trade.find(filter).lean();

    const restored: any[] = [];
    for (const t of trades) {
      await Trade.findByIdAndUpdate(t._id, {
        $set: { status: "OPEN" },
        $unset: { exitPrice: "", closedAt: "", closedReason: "", pnlUsdc: "", pnlPercent: "" },
      });
      await AILog.create({
        userId: toObjectId(userId),
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
  } catch (e) {
    return apiError(e);
  }
}
