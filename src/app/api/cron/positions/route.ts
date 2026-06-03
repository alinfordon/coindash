import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
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
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const userId = force && token?.uid ? String(token.uid) : undefined;
  const r = await runPositionCron({ manual: force, userId });
  return NextResponse.json(r);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
