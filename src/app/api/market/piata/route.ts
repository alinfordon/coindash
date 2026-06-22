import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { fetchAll24h, getSpotUsdcTradableSymbols } from "@/lib/binance";
import { buildPiataSections } from "@/lib/marketPiata";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await getApiUserId();
    const settings = await getSettings(userId);
    let spotUsdcSymbols = await getSpotUsdcTradableSymbols(settings.binanceTestnet);
    // Stale in-memory cache from before spotUsdcSymbols existed — rebuild once.
    if (spotUsdcSymbols.size === 0) {
      (global as any).__NEXUS_SYMBOLS__ = null;
      spotUsdcSymbols = await getSpotUsdcTradableSymbols(settings.binanceTestnet);
    }

    const tickersResult = await (async () => {
        try {
          return { tickers: await fetchAll24h(settings.binanceTestnet), fetchError: null as string | null };
        } catch (e: any) {
          return {
            tickers: [] as Awaited<ReturnType<typeof fetchAll24h>>,
            fetchError: e?.message?.slice(0, 200) || "Binance ticker fetch failed",
          };
        }
      })();

    const { tickers, fetchError } = tickersResult;
    const sections = buildPiataSections(
      tickers,
      spotUsdcSymbols,
      settings.binanceTestnet,
      settings.pairBlacklist
    );
    const btc = spotUsdcSymbols.has("BTCUSDC") ? tickers.find((t) => t.symbol === "BTCUSDC") : undefined;

    return NextResponse.json({
      ok: true,
      testnet: settings.binanceTestnet,
      spotUsdcCount: spotUsdcSymbols.size,
      updatedAt: new Date().toISOString(),
      fetchError,
      btc: btc
        ? { price: btc.lastPrice, change24h: btc.priceChangePercent, quoteVolume24h: btc.quoteVolume }
        : null,
      ...sections,
    });
  } catch (e) {
    return apiError(e);
  }
}
