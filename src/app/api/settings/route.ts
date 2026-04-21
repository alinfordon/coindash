import { NextResponse } from "next/server";
import { getSettings, updateSettings, redact } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSettings();
  return NextResponse.json(redact(s));
}

export async function POST(req: Request) {
  const body = await req.json();
  // Don't overwrite secrets if a masked placeholder was sent (contains "••••")
  const patch: any = { ...body };
  for (const k of ["aiApiKey", "binanceApiKey", "binanceApiSecret", "telegramBotToken"]) {
    if (typeof patch[k] === "string" && patch[k].includes("•")) delete patch[k];
  }
  const s = await updateSettings(patch);
  return NextResponse.json(redact(s));
}
