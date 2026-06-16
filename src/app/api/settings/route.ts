import { NextResponse } from "next/server";
import { getSettings, updateSettings, redact } from "@/lib/settings";
import { stripRedactedAiApiKeys } from "@/lib/aiApiKeys";
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
    const patch: Record<string, unknown> = { ...body };
    for (const k of ["aiApiKey", "binanceApiKey", "binanceApiSecret", "telegramBotToken"]) {
      if (typeof patch[k] === "string" && (patch[k] as string).includes("•")) delete patch[k];
    }
    const strippedKeys = stripRedactedAiApiKeys(patch.aiApiKeys);
    if (strippedKeys) patch.aiApiKeys = strippedKeys;
    else delete patch.aiApiKeys;
    const s = await updateSettings(userId, patch);
    return NextResponse.json(redact(s));
  } catch (e) {
    console.error("[api/settings] POST", e);
    return apiError(e);
  }
}
