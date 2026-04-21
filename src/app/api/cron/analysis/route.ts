import { NextResponse } from "next/server";
import { runAnalysisCron } from "@/workers/analysisCron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const r = await runAnalysisCron({ manual: true });
  return NextResponse.json(r);
}

export async function GET() {
  return POST();
}
