import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { reconcileOpenTrades } from "@/lib/reconciliation";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const settings = await getSettings(userId);
    const r = await reconcileOpenTrades(userId, settings);
    return NextResponse.json({
      ok: true,
      closedCount: r.closed.length,
      keptCount: r.kept,
      errorCount: r.errors.length,
      closed: r.closed,
      errors: r.errors,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "reconcile failed" }, { status: 500 });
  }
}
