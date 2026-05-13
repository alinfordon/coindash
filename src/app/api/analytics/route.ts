import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { computeAnalyticsReport, parseAnalyticsSearchParams } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await connectDB();
  const url = new URL(req.url);
  const filters = parseAnalyticsSearchParams(url.searchParams);
  try {
    const report = await computeAnalyticsReport(filters);
    return NextResponse.json(report);
  } catch (e: any) {
    console.error("[api/analytics]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "analytics failed" },
      { status: 500 }
    );
  }
}
