import { NextResponse } from "next/server";
import { getSettings, updateSettings, redact } from "@/lib/settings";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getApiUserId();
    const s = await getSettings(userId);
    return NextResponse.json(redact(s));
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getApiUserId();
    const body = await req.json();
    const patch: any = { ...body };
    for (const k of ["aiApiKey", "binanceApiKey", "binanceApiSecret", "telegramBotToken"]) {
      if (typeof patch[k] === "string" && patch[k].includes("•")) delete patch[k];
    }
    const s = await updateSettings(userId, patch);
    return NextResponse.json(redact(s));
  } catch (e) {
    return apiError(e);
  }
}
