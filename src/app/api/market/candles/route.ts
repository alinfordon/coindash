import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { getExchangeAdapter } from "@/lib/exchange";
import { normalizeAnalysisInterval } from "@/lib/analysisIntervals";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const userId = await getApiUserId();
    const settings = await getSettings(userId);
    const ex = getExchangeAdapter(settings);
    const { searchParams } = new URL(req.url);
    const pair = searchParams.get("pair")?.toUpperCase().trim() || "";
    const interval = normalizeAnalysisInterval(searchParams.get("interval") || "1h", "1h");
    const limit = Math.min(Math.max(+(searchParams.get("limit") || 300), 10), 500);
    const assetClass = searchParams.get("assetClass") === "tokenized_asset" ? "tokenized_asset" : "crypto";

    if (!pair) {
      return NextResponse.json({ ok: false, error: "pair required" }, { status: 400 });
    }

    const candles = await ex.fetchCandles(pair, interval, limit, assetClass as "crypto" | "tokenized_asset");

    const payload: Record<string, unknown> = {
      ok: true,
      exchange: ex.id,
      pair,
      interval,
      candles,
    };

    if (ex.id === "kraken") {
      const { resolveKrakenPair, krakenWsIntervalMinutes } = await import("@/lib/kraken");
      const meta = await resolveKrakenPair(
        pair,
        settings.krakenMarkets || "both",
        assetClass as "crypto" | "tokenized_asset"
      );
      const minutes = krakenWsIntervalMinutes(interval);
      payload.wsSymbol = meta.wsName;
      payload.krakenIntervalMinutes = minutes;
      payload.wsSupported = minutes != null;
    }

    return NextResponse.json(payload);
  } catch (e) {
    return apiError(e);
  }
}
