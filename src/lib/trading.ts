import { Trade } from "@/models/Trade";
import { AILog } from "@/models/AILog";
import { type RuntimeSettings, syncCashBalanceFromBinance } from "./settings";
import { toObjectId } from "./tenant";
import { resolveActiveExchange } from "./exchanges";
import { getExchangeAdapter, getExchangeAdapterForTrade } from "./exchange";
import { tradeExitBundle } from "./exchange/exitOrders";
import { detectKrakenAssetClass } from "./kraken";
import { floorToStep } from "./exchange/binanceAdapter";
import { notifyTelegram } from "./notify";
import { isPairBlacklisted } from "./pairBlacklist";
import type { AssetClass } from "./exchange/types";

export type OpenParams = {
  userId: string;
  pair: string;
  usdcValue: number;
  entryHint?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  withSlTp?: boolean;
  assetClass?: AssetClass;
  aiProvider: string;
  aiModel: string;
  aiConfidence: number;
  aiReasoning: string;
  indicators?: any;
  settings: RuntimeSettings;
};

export async function openPosition(p: OpenParams) {
  const ex = getExchangeAdapter(p.settings);
  const exchange = resolveActiveExchange(p.settings);
  const assetClass: AssetClass =
    p.assetClass ??
    (exchange === "kraken"
      ? detectKrakenAssetClass(p.pair, p.settings.krakenMarkets || "both")
      : "crypto");

  if (isPairBlacklisted(p.pair, p.settings.pairBlacklist)) {
    throw new Error(`${p.pair} is excluded (pair blacklist in Settings)`);
  }

  const [marketPrice, info] = await Promise.all([
    p.entryHint ? Promise.resolve(p.entryHint) : ex.fetchPrice(p.pair, assetClass),
    ex.getSymbolInfo(p.pair, assetClass).catch(() => null),
  ]);
  const price = marketPrice;

  if (info && p.usdcValue < info.minNotional) {
    throw new Error(`${p.pair}: order size $${p.usdcValue} < minNotional $${info.minNotional}`);
  }

  const rawQty = p.usdcValue / price;
  const quantity = info ? floorToStep(rawQty, info.stepSize) : +rawQty.toFixed(6);

  if (info && quantity * price < info.minNotional) {
    throw new Error(
      `${p.pair}: post-step qty ${quantity} × ${price} = $${(quantity * price).toFixed(2)} < minNotional $${info.minNotional}`
    );
  }

  const withSlTp = p.withSlTp !== false;
  const slPct = p.stopLossPct ?? p.settings.stopLossPercent;
  const tpPct = p.takeProfitPct ?? p.settings.takeProfitPercent;

  let buyOrderId = "";
  let ocoOrderId = "";
  let exitOrderIds: string[] = [];
  let ocoError: string | null = null;
  let entryPriceActual = price;
  let netQty = quantity;

  if (!p.settings.dryRun) {
    const buy = await ex.marketBuyQuote(p.pair, p.usdcValue, assetClass);
    buyOrderId = buy.orderId;
    entryPriceActual = buy.entryPrice || price;
    netQty = buy.executedQty || quantity;

    const finalQty = info ? floorToStep(netQty, info.stepSize) : +netQty.toFixed(6);
    netQty = finalQty;

    try {
      if (withSlTp) {
        const exits = await ex.placeExitOrders(
          p.pair,
          finalQty,
          entryPriceActual * (1 + tpPct / 100),
          entryPriceActual * (1 - slPct / 100),
          assetClass
        );
        if (exits.error) ocoError = exits.error;
        if (exits.bundle.kind === "oco") ocoOrderId = exits.bundle.ocoOrderId;
        if (exits.bundle.kind === "dual") exitOrderIds = exits.bundle.orderIds;
      }
    } catch (e: any) {
      ocoError = e.message?.slice(0, 300) || String(e);
      console.error(`[EXIT ORDERS FAIL] ${p.pair}: ${ocoError}`);
      await AILog.create({
        userId: toObjectId(p.userId),
        action: "ERROR",
        pair: p.pair,
        decision: "OCO_FAIL",
        reasoning: ocoError,
        meta: {
          entry: entryPriceActual,
          qty: finalQty,
          sl: entryPriceActual * (1 - slPct / 100),
          tp: entryPriceActual * (1 + tpPct / 100),
          exchange,
        },
      });
    }
  }

  const finalStopLoss = withSlTp ? entryPriceActual * (1 - slPct / 100) : undefined;
  const finalTakeProfit = withSlTp ? entryPriceActual * (1 + tpPct / 100) : undefined;

  const trade = await Trade.create({
    userId: toObjectId(p.userId),
    pair: p.pair,
    side: "BUY",
    status: "OPEN",
    entryPrice: entryPriceActual,
    quantity: netQty,
    usdcValue: p.usdcValue,
    stopLoss: finalStopLoss,
    takeProfit: finalTakeProfit,
    binanceOrderId: buyOrderId,
    ocoOrderId,
    exitOrderIds,
    exchange,
    assetClass,
    openedAt: new Date(),
    aiProvider: p.aiProvider,
    aiModel: p.aiModel,
    aiConfidence: p.aiConfidence,
    aiReasoning: p.aiReasoning,
    technicalIndicators: {
      ...(p.indicators || {}),
      withSlTp,
      ocoError: ocoError || undefined,
      exchange,
      assetClass,
    },
    dryRun: p.settings.dryRun,
  });

  await AILog.create({
    userId: toObjectId(p.userId),
    action: "BUY_SIGNAL",
    pair: p.pair,
    decision: "OPEN",
    confidence: p.aiConfidence,
    reasoning: p.aiReasoning,
    executedTrade: true,
    tradeId: trade._id,
    aiProvider: p.aiProvider,
  });

  const slTpLine = withSlTp
    ? `\nSL: $${finalStopLoss!.toFixed(6)} | TP: $${finalTakeProfit!.toFixed(6)}`
    : "\nFără SL/TP (doar MARKET)";

  await notifyTelegram(
    `🟢 <b>OPEN ${p.pair}</b> (${exchange})\nEntry: $${entryPriceActual.toFixed(6)}\nSize: $${p.usdcValue}${slTpLine}\nAI: ${p.aiProvider} (${p.aiConfidence}%)${ocoError ? "\n⚠️ Exit orders failed — monitoring via cron" : ""}${p.settings.dryRun ? "\n<i>[Dry Run]</i>" : ""}`
  );

  if (!p.settings.dryRun) {
    await syncCashBalanceFromBinance(p.userId);
  }

  return trade;
}

export async function closePosition(
  tradeId: string,
  userId: string,
  reason: "TP_HIT" | "SL_HIT" | "AI_DECISION" | "MANUAL",
  settings: RuntimeSettings
) {
  const trade = await Trade.findOne({ _id: tradeId, userId: toObjectId(userId) });
  if (!trade || trade.status !== "OPEN") throw new Error("Trade not open");

  const ex = getExchangeAdapterForTrade(settings, trade);
  const assetClass = (trade.assetClass as AssetClass) || "crypto";
  const price = await ex.fetchPrice(trade.pair as string, assetClass);

  let sellNote: string | null = null;

  if (!settings.dryRun && !trade.dryRun) {
    const bundle = tradeExitBundle(trade);

    if (bundle) {
      try {
        await ex.cancelExitOrders(trade.pair as string, bundle, assetClass);
      } catch (e: any) {
        console.warn("cancelExitOrders failed:", e?.message || e);
      }
      await new Promise((r) => setTimeout(r, 600));
    }

    try {
      const base = ex.baseAssetOf(trade.pair as string);
      const info = await ex.getSymbolInfo(trade.pair as string, assetClass).catch(() => null);
      const free = await ex.fetchFreeBalance(base);
      const wanted = trade.quantity as number;
      const rawQty = Math.min(wanted, free);
      const qtyToSell = info ? floorToStep(rawQty, info.stepSize) : +rawQty.toFixed(6);

      if (qtyToSell <= 0) {
        sellNote = `no free ${base} balance to sell (wanted=${wanted}, free=${free})`;
        console.warn(`[closePosition] ${trade.pair}: ${sellNote}`);
      } else if (info && qtyToSell * price < info.minNotional) {
        sellNote = `remaining ${base} dust below minNotional (${(qtyToSell * price).toFixed(2)} < ${info.minNotional})`;
        console.warn(`[closePosition] ${trade.pair}: ${sellNote}`);
      } else {
        try {
          await ex.marketSell(trade.pair as string, qtyToSell, assetClass);
          trade.quantity = qtyToSell;
        } catch (e: any) {
          sellNote = `marketSell failed: ${e?.message?.slice(0, 200) || e}`;
          console.warn("marketSell failed", e);
        }
      }
    } catch (e: any) {
      sellNote = `balance lookup failed: ${e?.message || e}`;
      console.warn("close balance lookup failed", e);
    }
  }

  const entry = trade.entryPrice as number;
  const qty = trade.quantity as number;
  const pnlUsdc = +((price - entry) * qty).toFixed(4);
  const pnlPercent = +(((price - entry) / entry) * 100).toFixed(4);

  trade.exitPrice = price;
  trade.status = "CLOSED";
  trade.closedAt = new Date();
  trade.closedReason = reason;
  trade.pnlUsdc = pnlUsdc;
  trade.pnlPercent = pnlPercent;
  await trade.save();

  await AILog.create({
    userId: toObjectId(userId),
    action: "SELL_SIGNAL",
    pair: trade.pair,
    decision: reason,
    confidence: 100,
    reasoning: `Closed via ${reason}. PnL ${pnlPercent}%${sellNote ? ` — ${sellNote}` : ""}`,
    executedTrade: true,
    tradeId: trade._id,
    meta: sellNote ? { sellNote } : undefined,
  });

  await notifyTelegram(
    `${pnlUsdc >= 0 ? "✅" : "❌"} <b>CLOSE ${trade.pair}</b> (${reason})\nExit: $${price}\nP&L: ${pnlPercent}% ($${pnlUsdc})${sellNote ? `\n⚠️ ${sellNote}` : ""}`
  );

  if (!settings.dryRun && !trade.dryRun) {
    await syncCashBalanceFromBinance(userId);
  }

  return trade;
}