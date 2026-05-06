import { Trade } from "@/models/Trade";
import { AILog } from "@/models/AILog";
import { type RuntimeSettings, syncCashBalanceFromBinance } from "./settings";
import {
  fetchPrice,
  marketBuyQuote,
  marketSell,
  placeOco,
  cancelOco,
  getSymbolInfo,
  floorToStep,
  fetchFreeBalance,
  baseAssetOf,
} from "./binance";
import { notifyTelegram } from "./notify";
import { isPairBlacklisted } from "./pairBlacklist";

export type OpenParams = {
  pair: string;
  usdcValue: number;
  entryHint?: number;
  stopLossPct: number;
  takeProfitPct: number;
  aiProvider: string;
  aiModel: string;
  aiConfidence: number;
  aiReasoning: string;
  indicators?: any;
  settings: RuntimeSettings;
};

export async function openPosition(p: OpenParams) {
  const testnet = p.settings.binanceTestnet;

  if (isPairBlacklisted(p.pair, p.settings.pairBlacklist)) {
    throw new Error(`${p.pair} is excluded (pair blacklist in Settings)`);
  }

  // Resolve current price + symbol filters first
  const [marketPrice, info] = await Promise.all([
    p.entryHint ? Promise.resolve(p.entryHint) : fetchPrice(p.pair, testnet),
    getSymbolInfo(p.pair, testnet).catch(() => null),
  ]);
  const price = marketPrice;

  // Pre-flight checks: minNotional
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

  const stopLoss = price * (1 - p.stopLossPct / 100);
  const takeProfit = price * (1 + p.takeProfitPct / 100);

  let buyOrder: any = null;
  let oco: any = null;
  let ocoError: string | null = null;
  let entryPriceActual = price;

  let netQty = quantity;

  if (!p.settings.dryRun) {
    buyOrder = await marketBuyQuote(p.pair, p.usdcValue, testnet);
    // Use real executed avg price + NET qty (after commission paid in base asset) from fills
    const fills = buyOrder?.fills as any[] | undefined;
    const baseAsset = baseAssetOf(p.pair);
    if (fills?.length) {
      const agg = fills.reduce(
        (a, f) => {
          const q = +f.qty;
          const px = +f.price;
          const commission = +f.commission || 0;
          const commissionAsset = String(f.commissionAsset || "");
          const feeInBase = commissionAsset === baseAsset ? commission : 0;
          return {
            qty: a.qty + q,
            netQty: a.netQty + (q - feeInBase),
            notional: a.notional + q * px,
          };
        },
        { qty: 0, netQty: 0, notional: 0 }
      );
      if (agg.qty > 0) entryPriceActual = agg.notional / agg.qty;
      if (agg.netQty > 0) netQty = agg.netQty;
    } else if (buyOrder?.executedQty) {
      netQty = +buyOrder.executedQty;
    }

    // Floor to step for exchange compliance
    const finalQty = info ? floorToStep(netQty, info.stepSize) : +netQty.toFixed(6);
    netQty = finalQty;

    try {
      oco = await placeOco(
        p.pair,
        finalQty,
        entryPriceActual * (1 + p.takeProfitPct / 100),
        entryPriceActual * (1 - p.stopLossPct / 100),
        testnet
      );
    } catch (e: any) {
      ocoError = e.message?.slice(0, 300) || String(e);
      console.error(`[OCO FAIL] ${p.pair}: ${ocoError}`);
      await AILog.create({
        action: "ERROR",
        pair: p.pair,
        decision: "OCO_FAIL",
        reasoning: ocoError,
        meta: { entry: entryPriceActual, qty: finalQty, sl: entryPriceActual * (1 - p.stopLossPct / 100), tp: entryPriceActual * (1 + p.takeProfitPct / 100) },
      });
    }
  }

  const finalStopLoss = entryPriceActual * (1 - p.stopLossPct / 100);
  const finalTakeProfit = entryPriceActual * (1 + p.takeProfitPct / 100);

  const trade = await Trade.create({
    pair: p.pair,
    side: "BUY",
    status: "OPEN",
    entryPrice: entryPriceActual,
    quantity: netQty,
    usdcValue: p.usdcValue,
    stopLoss: finalStopLoss,
    takeProfit: finalTakeProfit,
    binanceOrderId: buyOrder?.orderId?.toString() || "",
    ocoOrderId: oco?.orderListId?.toString() || "",
    openedAt: new Date(),
    aiProvider: p.aiProvider,
    aiModel: p.aiModel,
    aiConfidence: p.aiConfidence,
    aiReasoning: p.aiReasoning,
    technicalIndicators: { ...(p.indicators || {}), ocoError: ocoError || undefined },
    dryRun: p.settings.dryRun,
  });

  await AILog.create({
    action: "BUY_SIGNAL",
    pair: p.pair,
    decision: "OPEN",
    confidence: p.aiConfidence,
    reasoning: p.aiReasoning,
    executedTrade: true,
    tradeId: trade._id,
    aiProvider: p.aiProvider,
  });

  await notifyTelegram(
    `🟢 <b>OPEN ${p.pair}</b>\nEntry: $${entryPriceActual.toFixed(6)}\nSize: $${p.usdcValue}\nSL: $${finalStopLoss.toFixed(6)} | TP: $${finalTakeProfit.toFixed(6)}\nAI: ${p.aiProvider} (${p.aiConfidence}%)${ocoError ? "\n⚠️ OCO failed — monitoring via cron" : ""}${p.settings.dryRun ? "\n<i>[Dry Run]</i>" : ""}`
  );

  // Refresh cached USDC cash snapshot so the dashboard reflects the spent amount.
  if (!p.settings.dryRun) {
    await syncCashBalanceFromBinance(p.settings.binanceTestnet);
  }

  return trade;
}

export async function closePosition(tradeId: string, reason: "TP_HIT" | "SL_HIT" | "AI_DECISION" | "MANUAL", settings: RuntimeSettings) {
  const trade = await Trade.findById(tradeId);
  if (!trade || trade.status !== "OPEN") throw new Error("Trade not open");
  const price = await fetchPrice(trade.pair, settings.binanceTestnet);

  let sellNote: string | null = null;

  if (!settings.dryRun && !trade.dryRun) {
    const testnet = settings.binanceTestnet;

    // 1) Cancel OCO to release the locked balance
    if (trade.ocoOrderId) {
      try {
        await cancelOco(trade.pair, trade.ocoOrderId, testnet);
      } catch (e: any) {
        // If OCO was already filled/cancelled (e.g. TP/SL just hit), this is fine — continue.
        console.warn("cancelOco failed:", e?.message || e);
      }
      // Give Binance a beat to release reserved funds before re-selling
      await new Promise((r) => setTimeout(r, 600));
    }

    // 2) Figure out how much we can actually sell right now
    try {
      const base = baseAssetOf(trade.pair);
      const info = await getSymbolInfo(trade.pair, testnet).catch(() => null);
      const free = await fetchFreeBalance(base, testnet);
      const wanted = trade.quantity as number;

      // Use min of requested and free, floored to step size; Binance fee was already subtracted on buy
      // but OCO stop-limit partial fills / rounding can leave marginally less.
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
          await marketSell(trade.pair, qtyToSell, testnet);
          // Record the actually-sold qty on the trade for accurate PnL downstream
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

  // Refresh cached USDC cash snapshot so the dashboard reflects the proceeds.
  if (!settings.dryRun && !trade.dryRun) {
    await syncCashBalanceFromBinance(settings.binanceTestnet);
  }

  return trade;
}
