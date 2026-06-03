import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { reclassifyReconciledTrades, reclassifyAllReconciledTrades } from "@/lib/reconciliation";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const settings = await getSettings(userId);
    let body: { limit?: number; since?: string; all?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }
    const since = body.since ? new Date(body.since) : undefined;
    if (body.all) {
      const r = await reclassifyAllReconciledTrades(userId, settings, { since });
      return NextResponse.json({ ok: true, ...r, samples: [] });
    }
    const r = await reclassifyReconciledTrades(userId, settings, { limit: body.limit, since });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "reclassify failed" }, { status: 500 });
  }
}
