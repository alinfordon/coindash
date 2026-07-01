import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { probeKrakenXStocks } from "@/lib/kraken";
import { getApiUserId } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const userId = await getApiUserId();
    const body = await req.json().catch(() => ({}));
    const current = await getSettings(userId);
    const apiKey =
      body.krakenApiKey && !String(body.krakenApiKey).includes("•")
        ? body.krakenApiKey
        : current.krakenApiKey;
    const apiSecret =
      body.krakenApiSecret && !String(body.krakenApiSecret).includes("•")
        ? body.krakenApiSecret
        : current.krakenApiSecret;

    const probe = await probeKrakenXStocks({
      apiKey: apiKey || undefined,
      apiSecret: apiSecret || undefined,
      sampleLimit: typeof body.sampleLimit === "number" ? body.sampleLimit : 12,
    });

    return NextResponse.json({ ok: true, ...probe });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message?.slice(0, 400) || "xStocks probe failed" },
      { status: 400 }
    );
  }
}
