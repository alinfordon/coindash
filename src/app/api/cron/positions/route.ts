import { NextResponse } from "next/server";
import { runPositionCron } from "@/workers/positionCron";
import { checkCronAuth } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = checkCronAuth(req);
  if (denied) return denied;
  const r = await runPositionCron({ manual: true });
  return NextResponse.json(r);
}

export async function GET(req: Request) {
  return POST(req);
}
