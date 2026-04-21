import { NextResponse } from "next/server";
import { runPositionCron } from "@/workers/positionCron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const r = await runPositionCron({ manual: true });
  return NextResponse.json(r);
}

export async function GET() {
  return POST();
}
