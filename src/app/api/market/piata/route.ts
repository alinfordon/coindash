import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { getExchangeAdapter, type ExchangeAdapter } from "@/lib/exchange";
import { buildPiataMarket, type PiataMarketSections } from "@/lib/marketPiata";
import { loadKrakenPairs, isKrakenUsdQuoteSymbol } from "@/lib/kraken";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

function symbolSetsFromKraken(scope: "crypto" | "stocks" | "both") {
  return loadKrakenPairs(scope).then((map) => {
    const crypto = new Set<string>();
    const xstocks = new Set<string>();
    for (const meta of map.values()) {
      if (!isKrakenUsdQuoteSymbol(meta.symbol)) continue;
      if (meta.assetClass === "tokenized_asset") {
        if (/SPV/i.test(meta.krakenPair)) continue;
        xstocks.add(meta.symbol);
      } else {
        crypto.add(meta.symbol);
      }
    }
    return { crypto, xstocks };
  });
}

export async function GET() {
  try {
    const userId = await getApiUserId();
    const settings = await getSettings(userId);
    const ex = getExchangeAdapter(settings);

    const tickersResult = await (async () => {
      try {
        return { tickers: await ex.fetchAll24h(), fetchError: null as string | null };
      } catch (e: any) {
        return {
          tickers: [] as Awaited<ReturnType<ExchangeAdapter["fetchAll24h"]>>,
          fetchError: e?.message?.slice(0, 200) || "Ticker fetch failed",
        };
      }
    })();

    const { tickers, fetchError } = tickersResult;
    const testnet = ex.id === "binance" && settings.binanceTestnet;
    const krakenMarkets = settings.krakenMarkets || "both";

    if (ex.id === "kraken") {
      const { crypto, xstocks } = await symbolSetsFromKraken(krakenMarkets);
      const markets: Record<string, PiataMarketSections> = {};

      if (krakenMarkets === "crypto" || krakenMarkets === "both") {
        markets.crypto = buildPiataMarket(tickers, crypto, false, settings.pairBlacklist, {
          minQuoteVolume: 50_000,
          assetClass: "crypto",
          btcSymbol: [...crypto].find((s) => s.startsWith("BTC")) || "BTCUSD",
        });
      }

      if (krakenMarkets === "stocks" || krakenMarkets === "both") {
        markets.xstocks = buildPiataMarket(tickers, xstocks, false, settings.pairBlacklist, {
          minQuoteVolume: 1_000,
          assetClass: "tokenized_asset",
        });
      }

      return NextResponse.json({
        ok: true,
        exchange: "kraken",
        testnet: false,
        krakenMarkets,
        updatedAt: new Date().toISOString(),
        fetchError,
        markets,
        spotCount: crypto.size + xstocks.size,
      });
    }

    const spotSymbols = await ex.getTradableSymbols();
    const market = buildPiataMarket(tickers, spotSymbols, testnet, settings.pairBlacklist, {
      assetClass: "crypto",
      btcSymbol: [...spotSymbols].find((s) => s.startsWith("BTC")) || "BTCUSDC",
    });

    return NextResponse.json({
      ok: true,
      exchange: "binance",
      testnet,
      krakenMarkets: null,
      updatedAt: new Date().toISOString(),
      fetchError,
      markets: { default: market },
      spotCount: spotSymbols.size,
      ...market,
    });
  } catch (e) {
    return apiError(e);
  }
}
