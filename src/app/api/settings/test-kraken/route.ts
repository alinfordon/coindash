import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { testKrakenConnection } from "@/lib/kraken";
import { getApiUserId, apiError } from "@/lib/apiUser";

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

    try {
      const result = await testKrakenConnection(apiKey, apiSecret);
      return NextResponse.json({
        ok: true,
        balances: result.balances,
        usdcFree: result.usdcFree,
      });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message?.slice(0, 400) }, { status: 400 });
    }
  } catch (e) {
    return apiError(e);
  }
}
