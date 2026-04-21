import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { callAI } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const current = await getSettings();
  const s = {
    ...current,
    aiProvider: body.aiProvider || current.aiProvider,
    aiModel: body.aiModel || current.aiModel,
    aiApiKey: body.aiApiKey && !body.aiApiKey.includes("•") ? body.aiApiKey : current.aiApiKey,
    ollamaUrl: body.ollamaUrl || current.ollamaUrl,
  };

  try {
    const r = await callAI(`Reply ONLY with: {"ok":true,"provider":"${s.aiProvider}"}`, s);
    return NextResponse.json({ ok: true, latencyMs: r.latencyMs, sample: r.text.slice(0, 200) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.slice(0, 400) }, { status: 400 });
  }
}
