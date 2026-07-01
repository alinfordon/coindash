import { NextResponse } from "next/server";
import { getSettings, updateSettings, redact } from "@/lib/settings";
import { type ExchangeId, exchangeLabel, getActiveExchange, isExchangeConnected } from "@/lib/exchanges";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const userId = await getApiUserId();
    const body = await req.json().catch(() => ({}));
    const exchange = body.exchange === "kraken" ? "kraken" : body.exchange === "binance" ? "binance" : null;
    if (!exchange) {
      return NextResponse.json({ ok: false, error: "Exchange invalid" }, { status: 400 });
    }

    const current = await getSettings(userId);
    const patch: Record<string, string | ExchangeId> =
      exchange === "binance"
        ? { binanceApiKey: "", binanceApiSecret: "" }
        : { krakenApiKey: "", krakenApiSecret: "" };

    if (getActiveExchange(current) === exchange) {
      const other: ExchangeId = exchange === "binance" ? "kraken" : "binance";
      if (isExchangeConnected(current, other)) {
        patch.activeExchange = other;
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: `${exchangeLabel(exchange)} este activ — conectează ${exchangeLabel(other)} înainte de deconectare.`,
          },
          { status: 400 }
        );
      }
    }

    const s = await updateSettings(userId, patch);
    return NextResponse.json({ ok: true, settings: redact(s) });
  } catch (e) {
    return apiError(e);
  }
}
