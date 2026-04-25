import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { reconcileOpenTrades } from "@/lib/reconciliation";

export const dynamic = "force-dynamic";

export async function POST() {
  await connectDB();
  const settings = await getSettings();
  try {
    const r = await reconcileOpenTrades(settings);
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
