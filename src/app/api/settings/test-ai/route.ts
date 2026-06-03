import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { callAI, resolveAiProfile } from "@/lib/ai";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
  const userId = await getApiUserId();
  const body = await req.json().catch(() => ({}));
  const current = await getSettings(userId);
  const s = {
    ...current,
    aiProvider: body.aiProvider || current.aiProvider,
    aiModel: body.aiModel || current.aiModel,
    analysisAiModel: body.analysisAiModel ?? current.analysisAiModel ?? "",
    zaiBaseUrl: body.zaiBaseUrl ?? current.zaiBaseUrl ?? "https://api.z.ai/api/paas/v4",
    aiApiKey: body.aiApiKey && !body.aiApiKey.includes("•") ? body.aiApiKey : current.aiApiKey,
    ollamaUrl: body.ollamaUrl || current.ollamaUrl,
  };
  const role = body.testRole === "analysis" ? "analysis" : "default";
  const profile = resolveAiProfile(s, role);

  try {
    const r = await callAI(`Reply ONLY with: {"ok":true,"provider":"${profile.provider}","model":"${profile.model}"}`, s, {
      role,
    });
    return NextResponse.json({ ok: true, latencyMs: r.latencyMs, model: r.model, sample: r.text.slice(0, 200) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.slice(0, 400) }, { status: 400 });
  }
  } catch (e) {
    return apiError(e);
  }
}
