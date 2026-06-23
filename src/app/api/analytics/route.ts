import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { computeAnalyticsReport, parseAnalyticsSearchParams } from "@/lib/analytics";
import { getApiUserId, apiError } from "@/lib/apiUser";
import { requireStatsAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireStatsAccess();
    await connectDB();
    const userId = await getApiUserId();
    const url = new URL(req.url);
    const filters = { ...parseAnalyticsSearchParams(url.searchParams), userId };
    const report = await computeAnalyticsReport(filters);
    return NextResponse.json(report);
  } catch (e: any) {
    console.error("[api/analytics]", e);
    return apiError(e, e?.message || "analytics failed");
  }
}
