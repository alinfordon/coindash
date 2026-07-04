import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { getSettings } from "@/lib/settings";
import { getExchangeAdapter } from "@/lib/exchange";
import { openPosition } from "@/lib/trading";
import { resolveAiProfile } from "@/lib/ai";
import { userScope } from "@/lib/tenant";
import { getApiUserId, apiError } from "@/lib/apiUser";
import {
  detectKrakenAssetClass,
  fetchKrakenQuoteBalanceForPair,
  isKrakenUsdQuoteSymbol,
  krakenBaseAsset,
  krakenBuyFeeBuffer,
  type KrakenQuoteAsset,
} from "@/lib/kraken";
import type { KrakenMarketScope } from "@/lib/exchange/types";

export const dynamic = "force-dynamic";

function effectiveTakeProfitPct(sl: number, tp: number, rr: number): number {
  return Math.max(tp, sl * rr);
}

async function quoteBalanceForPair(
  ex: ReturnType<typeof getExchangeAdapter>,
  settings: Awaited<ReturnType<typeof getSettings>>,
  pair: string
): Promise<{ free: number; quote: KrakenQuoteAsset | "USDC"; hold?: number; total?: number }> {
  if (ex.id === "kraken" && pair) {
    const scope = (settings.krakenMarkets || "both") as KrakenMarketScope;
    const assetClass = detectKrakenAssetClass(pair, scope);
    const bal = await fetchKrakenQuoteBalanceForPair(
      settings.krakenApiKey,
      settings.krakenApiSecret,
      pair,
      scope,
      assetClass
    );
    return { free: bal.available, quote: bal.quote, hold: bal.hold, total: bal.total };
  }
  return { free: await ex.fetchQuoteBalance(), quote: "USDC" };
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const settings = await getSettings(userId);
    const ex = getExchangeAdapter(settings);
    const { searchParams } = new URL(req.url);
    const pair = searchParams.get("pair")?.toUpperCase().trim() || "";

    let freeUsdc: number | null = null;
    let freeUsdcError: string | null = null;
    let quoteCurrency: KrakenQuoteAsset | "USDC" = "USDC";
    let quoteHold: number | null = null;
    let quoteTotal: number | null = null;
    if (!settings.dryRun) {
      try {
        if (pair) {
          const qb = await quoteBalanceForPair(ex, settings, pair);
          freeUsdc = qb.free;
          quoteCurrency = qb.quote;
          quoteHold = qb.hold ?? null;
          quoteTotal = qb.total ?? null;
        } else {
          freeUsdc = await ex.fetchQuoteBalance();
        }
      } catch (e: any) {
        freeUsdcError = e?.message?.slice(0, 200) || "balance fetch failed";
        freeUsdc = settings.cashBalanceUsdc ?? 0;
      }
    }

    let minNotional: number | null = null;
    if (pair) {
      try {
        const info = await ex.getSymbolInfo(pair);
        minNotional = info.minNotional;
      } catch {
        /* optional */
      }
    }

    const openForPair = pair
      ? await Trade.findOne(userScope(userId, { pair, status: "OPEN" })).lean()
      : null;

    return NextResponse.json({
      ok: true,
      freeUsdc,
      quoteCurrency,
      quoteHold,
      quoteTotal,
      freeUsdcError,
      minNotional,
      alreadyOpen: !!openForPair,
      dryRun: settings.dryRun === true,
      exchange: ex.id,
      testnet: ex.id === "binance" && settings.binanceTestnet === true,
      maxUsdcPerOrder: settings.maxUsdcPerOrder,
      stopLossPercent: settings.stopLossPercent,
      takeProfitPercent: settings.takeProfitPercent,
      riskRewardRatio: settings.riskRewardRatio,
      effectiveTakeProfitPercent: effectiveTakeProfitPct(
        settings.stopLossPercent,
        settings.takeProfitPercent,
        settings.riskRewardRatio
      ),
      maxOpenPairs: settings.maxOpenPairs,
      openPositions: await Trade.countDocuments(userScope(userId, { status: "OPEN" })),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const settings = await getSettings(userId);
    const ex = getExchangeAdapter(settings);
    const body = await req.json();

    const pair = String(body.pair || "")
      .toUpperCase()
      .trim();
    const usdcValue = Number(body.usdcValue);
    const withSlTp = body.withSlTp !== false;
    const stopLossPct = body.stopLossPercent != null ? Number(body.stopLossPercent) : undefined;
    const takeProfitPct = body.takeProfitPercent != null ? Number(body.takeProfitPercent) : undefined;
    const entryHint = body.entryHint != null ? Number(body.entryHint) : undefined;
    const aiConfidence = body.aiConfidence != null ? Number(body.aiConfidence) : 0;
    const aiReasoning = String(body.aiReasoning || "Manual buy from Analysis page");

    if (!pair || !/^[A-Z0-9]{2,}(USDC|USDT|USD|EUR)$/i.test(pair)) {
      return NextResponse.json({ ok: false, error: "Invalid pair" }, { status: 400 });
    }
    if (ex.id === "kraken" && !isKrakenUsdQuoteSymbol(pair)) {
      const alt = `${krakenBaseAsset(pair)}USD`;
      return NextResponse.json(
        {
          ok: false,
          error: `Pereche EUR (${pair}) — rămâi pe USD. Folosește ${alt} sau altă pereche *USD/*USDC.`,
        },
        { status: 400 }
      );
    }
    if (!Number.isFinite(usdcValue) || usdcValue < 10) {
      return NextResponse.json({ ok: false, error: "USDC amount must be at least 10" }, { status: 400 });
    }
    if (withSlTp) {
      if (!Number.isFinite(stopLossPct) || stopLossPct! <= 0 || stopLossPct! > 50) {
        return NextResponse.json({ ok: false, error: "Stop loss must be between 0 and 50%" }, { status: 400 });
      }
      if (!Number.isFinite(takeProfitPct) || takeProfitPct! <= 0 || takeProfitPct! > 100) {
        return NextResponse.json({ ok: false, error: "Take profit must be between 0 and 100%" }, { status: 400 });
      }
    }

    const existing = await Trade.findOne(userScope(userId, { pair, status: "OPEN" }));
    if (existing) {
      return NextResponse.json({ ok: false, error: `${pair} already has an open position` }, { status: 400 });
    }

    const openCount = await Trade.countDocuments(userScope(userId, { status: "OPEN" }));
    if (openCount >= settings.maxOpenPairs) {
      return NextResponse.json(
        { ok: false, error: `Max open pairs reached (${settings.maxOpenPairs})` },
        { status: 400 }
      );
    }

    if (!settings.dryRun) {
      const { free: freeQuote, quote, hold, total } = await quoteBalanceForPair(ex, settings, pair);
      const buffer = ex.id === "kraken" ? krakenBuyFeeBuffer(usdcValue) : 0;
      if (freeQuote + 1e-6 < usdcValue + buffer) {
        const holdNote =
          ex.id === "kraken" && (hold ?? 0) > 0
            ? ` ${hold!.toFixed(2)} ${quote} blocat în ordine deschise pe Kraken — anulează-le sau reduce suma.`
            : ex.id === "kraken" && quote === "USD" && (total ?? 0) > freeQuote
              ? " Verifică dacă ai USDC în loc de USD (solduri separate pe Kraken)."
              : "";
        return NextResponse.json(
          {
            ok: false,
            error: `Insufficient ${quote} (available ${freeQuote.toFixed(2)}, need ~${usdcValue.toFixed(2)}${buffer ? ` + ${buffer.toFixed(2)} fees` : ""}).${holdNote}`,
          },
          { status: 400 }
        );
      }
    }

    try {
        const info = await ex.getSymbolInfo(pair);
      if (usdcValue < info.minNotional) {
        return NextResponse.json(
          { ok: false, error: `Order size $${usdcValue} below min notional $${info.minNotional}` },
          { status: 400 }
        );
      }
    } catch {
      /* optional if symbol lookup fails */
    }

    const tpEffective = withSlTp
      ? effectiveTakeProfitPct(stopLossPct!, takeProfitPct!, settings.riskRewardRatio)
      : undefined;
    const aiProfile = resolveAiProfile(settings, "analysis");

    const trade = await openPosition({
      userId,
      pair,
      usdcValue,
      entryHint: Number.isFinite(entryHint) ? entryHint : undefined,
      withSlTp,
      stopLossPct: withSlTp ? stopLossPct : undefined,
      takeProfitPct: withSlTp ? tpEffective : undefined,
      aiProvider: aiProfile.provider,
      aiModel: aiProfile.model,
      aiConfidence,
      aiReasoning,
      indicators: body.indicators,
      settings,
    });

    return NextResponse.json({
      ok: true,
      trade: {
        id: trade._id,
        pair: trade.pair,
        entryPrice: trade.entryPrice,
        quantity: trade.quantity,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        usdcValue: trade.usdcValue,
        dryRun: trade.dryRun,
      },
      takeProfitPercentUsed: tpEffective ?? null,
    });
  } catch (e: any) {
    let msg = e?.message || "Order failed";
    if (/EOrder:Insufficient funds/i.test(msg)) {
      msg =
        "Kraken: fonduri insuficiente. Verifică soldul USD disponibil (nu total), ordine deschise care blochează fonduri, și că nu ai doar USDC pentru o pereche *USD.";
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
