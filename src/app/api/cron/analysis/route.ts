import { NextResponse, type NextRequest } from "next/server";
import { runAnalysisCron } from "@/workers/analysisCron";
import { checkCronAuth } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const denied = await checkCronAuth(req);
  if (denied) return denied;
  const r = await runAnalysisCron({ manual: true });
  return NextResponse.json(r);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
