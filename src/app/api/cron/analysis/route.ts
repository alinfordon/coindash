import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { runAnalysisCron } from "@/workers/analysisCron";
import { checkCronAuth } from "@/lib/cronAuth";
import { requireUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual trigger only bypasses the pilotActive switch when the caller passes
 * `?force=1`. This way the dashboard "Run Analysis" button (explicit user
 * action) still works while the pilot is paused, but background pollers (e.g.
 * worker.mjs hitting this endpoint on a timer) respect the pause.
 */
export async function POST(req: NextRequest) {
  const denied = await checkCronAuth(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("manual") === "1";
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  let userId: string | undefined;
  if (force) {
    try {
      userId = await requireUserId();
    } catch {
      userId = token?.uid ? String(token.uid) : undefined;
    }
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized — sign in again to run analysis" },
        { status: 401 }
      );
    }
  }

  const r = await runAnalysisCron({ manual: force, userId });
  return NextResponse.json({ ok: !("error" in r && r.error && !r.analyzed), ...r });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
