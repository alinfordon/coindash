import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { reclassifyReconciledTrades, reclassifyAllReconciledTrades } from "@/lib/reconciliation";

export const dynamic = "force-dynamic";

/**
 * Reclassify closed trades labeled RECONCILED using Binance OCO/myTrades fills.
 *
 * Body: { limit?: number, since?: string ISO date, all?: boolean }
 */
export async function POST(req: Request) {
  await connectDB();
  const settings = await getSettings();
  let body: { limit?: number; since?: string; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const since = body.since ? new Date(body.since) : undefined;
  try {
    if (body.all) {
      const r = await reclassifyAllReconciledTrades(settings, { since });
      return NextResponse.json({ ok: true, ...r, samples: [] });
    }
    const r = await reclassifyReconciledTrades(settings, { limit: body.limit, since });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "reclassify failed" }, { status: 500 });
  }
}
