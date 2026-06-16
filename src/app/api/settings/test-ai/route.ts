import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { callAI, resolveAiProfile } from "@/lib/ai";
import { activeCloudProvider, isRedactedSecret, resolveAiApiKeyForProvider, stripRedactedAiApiKeys } from "@/lib/aiApiKeys";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
  const userId = await getApiUserId();
  const body = await req.json().catch(() => ({}));
  const current = await getSettings(userId);
  const provider = body.aiProvider || current.aiProvider;
  const aiApiKeys = { ...current.aiApiKeys };
  const incoming = stripRedactedAiApiKeys(body.aiApiKeys);
  if (incoming) Object.assign(aiApiKeys, incoming);
  if (typeof body.aiApiKey === "string" && body.aiApiKey && !isRedactedSecret(body.aiApiKey)) {
    const cloud = activeCloudProvider(provider);
    if (cloud) aiApiKeys[cloud] = body.aiApiKey.trim();
  }
  const s = {
    ...current,
    aiProvider: provider,
    aiModel: body.aiModel || current.aiModel,
    analysisAiModel: body.analysisAiModel ?? current.analysisAiModel ?? "",
    deepseekBaseUrl: body.deepseekBaseUrl ?? current.deepseekBaseUrl ?? "https://api.deepseek.com",
    aiApiKeys,
    aiApiKey: resolveAiApiKeyForProvider({ aiProvider: provider, aiApiKeys, aiApiKey: "" }),
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
