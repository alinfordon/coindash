import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Trade } from "@/models/Trade";
import { getSettings } from "@/lib/settings";
import { fetchUsdcBalance, getSymbolInfo } from "@/lib/binance";
import { openPosition } from "@/lib/trading";
import { resolveAiProfile } from "@/lib/ai";
import { userScope } from "@/lib/tenant";
import { getApiUserId, apiError } from "@/lib/apiUser";

export const dynamic = "force-dynamic";

function effectiveTakeProfitPct(sl: number, tp: number, rr: number): number {
  return Math.max(tp, sl * rr);
}

export async function GET(req: Request) {
  try {
    await connectDB();
    const userId = await getApiUserId();
    const settings = await getSettings(userId);
    const { searchParams } = new URL(req.url);
    const pair = searchParams.get("pair")?.toUpperCase().trim() || "";

    let freeUsdc: number | null = null;
    let freeUsdcError: string | null = null;
    if (!settings.dryRun) {
      try {
        freeUsdc = await fetchUsdcBalance(settings.binanceTestnet);
      } catch (e: any) {
        freeUsdcError = e?.message?.slice(0, 200) || "balance fetch failed";
        freeUsdc = settings.cashBalanceUsdc ?? 0;
      }
    }

    let minNotional: number | null = null;
    if (pair) {
      try {
        const info = await getSymbolInfo(pair, settings.binanceTestnet);
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
      freeUsdcError,
      minNotional,
      alreadyOpen: !!openForPair,
      dryRun: settings.dryRun === true,
      testnet: settings.binanceTestnet === true,
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

    if (!pair || !pair.endsWith("USDC")) {
      return NextResponse.json({ ok: false, error: "Invalid pair" }, { status: 400 });
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
      const freeUsdc = await fetchUsdcBalance(settings.binanceTestnet);
      if (freeUsdc + 1e-6 < usdcValue) {
        return NextResponse.json(
          { ok: false, error: `Insufficient USDC (free ${freeUsdc.toFixed(2)}, need ${usdcValue.toFixed(2)})` },
          { status: 400 }
        );
      }
    }

    try {
      const info = await getSymbolInfo(pair, settings.binanceTestnet);
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
    const msg = e?.message || "Order failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
