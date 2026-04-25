import { NextResponse, type NextRequest } from "next/server";
import { runPositionCron } from "@/workers/positionCron";
import { checkCronAuth } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual trigger only bypasses the pilotActive switch when the caller passes
 * `?force=1`. Same rationale as /api/cron/analysis.
 */
export async function POST(req: NextRequest) {
  const denied = await checkCronAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("manual") === "1";
  const r = await runPositionCron({ manual: force });
  return NextResponse.json(r);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
