import { Trade } from "@/models/Trade";
import { AILog } from "@/models/AILog";
import type { RuntimeSettings } from "./settings";
import { toObjectId, userScope } from "./tenant";
import { getExchangeAdapter, getExchangeAdapterForTrade } from "./exchange";
import { tradeExitBundle } from "./exchange/exitOrders";
import type { AssetClass, ExchangeAdapter } from "./exchange/types";

export type ReconcileResult = {
  pair: string;
  tradeId: string;
  freeBalance: number;
  lockedBalance: number;
  totalBalance: number;
  expectedQty: number;
  reason: string;
  closedReason: "TP_HIT" | "SL_HIT" | "RECONCILED";
  exitPrice: number;
  pnlUsdc: number;
  pnlPercent: number;
};

type OpenTrade = {
  _id: unknown;
  pair: string;
  quantity?: number;
  entryPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  ocoOrderId?: string;
  exitOrderIds?: string[];
  exchange?: string;
  assetClass?: string;
  openedAt?: Date;
  dryRun?: boolean;
};

type OcoState = "EXECUTING" | "ALL_DONE" | "UNKNOWN";

/** Infer TP vs SL from fill price and configured levels. */
export function inferCloseReasonFromFill(
  entry: number,
  exitPrice: number,
  takeProfit?: number | null,
  stopLoss?: number | null
): "TP_HIT" | "SL_HIT" {
  const tp = takeProfit ?? entry * 1.04;
  const sl = stopLoss ?? entry * 0.98;
  const mid = (tp + sl) / 2;
  if (exitPrice >= mid) return "TP_HIT";
  return "SL_HIT";
}

function pnlFromExit(entry: number, exitPrice: number, qty: number) {
  const pnlUsdc = +((exitPrice - entry) * qty).toFixed(4);
  const pnlPercent = +(((exitPrice - entry) / entry) * 100).toFixed(4);
  return { pnlUsdc, pnlPercent };
}

/** FIFO: which OPEN rows still have enough wallet balance behind them. */
export function allocateBalanceToTrades(
  trades: OpenTrade[],
  balanceTotal: number,
  minQty: number
): { backed: OpenTrade[]; unbacked: OpenTrade[] } {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.openedAt || 0).getTime() - new Date(b.openedAt || 0).getTime()
  );
  let avail = balanceTotal;
  const backed: OpenTrade[] = [];
  const unbacked: OpenTrade[] = [];

  for (const t of sorted) {
    const expected = (t.quantity as number) || 0;
    const need = Math.max(expected * 0.92, minQty);
    if (expected > 0 && avail + 1e-12 >= need) {
      backed.push(t);
      avail = Math.max(0, avail - expected);
    } else {
      unbacked.push(t);
    }
  }
  return { backed, unbacked };
}

async function queryOcoState(
  ex: ExchangeAdapter,
  pair: string,
  trade: OpenTrade,
  assetClass?: AssetClass
): Promise<OcoState> {
  const bundle = tradeExitBundle(trade);
  if (!bundle) return "UNKNOWN";
  try {
    const state = await ex.queryExitState(pair, bundle, assetClass);
    if (state === "EXECUTING") return "EXECUTING";
    if (state === "ALL_DONE") return "ALL_DONE";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

async function filledExitFromOco(
  ex: ExchangeAdapter,
  pair: string,
  trade: OpenTrade,
  assetClass?: AssetClass
): Promise<{ exitPrice: number; orderId?: string } | null> {
  const bundle = tradeExitBundle(trade);
  if (!bundle) return null;
  return ex.filledExitPrice(pair, bundle, assetClass);
}

async function filledExitFromMyTrades(
  ex: ExchangeAdapter,
  pair: string,
  openedAt: Date | undefined,
  expectedQty: number,
  assetClass?: AssetClass,
  closedAt?: Date
): Promise<number | null> {
  const startTime = openedAt ? new Date(openedAt).getTime() - 60_000 : Date.now() - 7 * 86400000;
  const endTime = closedAt ? new Date(closedAt).getTime() + 15 * 60_000 : undefined;
  try {
    const trades = await ex.fetchMyTrades(pair, { startTime: startTime, limit: 100, closedAt: endTime }, assetClass);
    let sells = trades.filter((t) => !t.isBuyer);
    if (endTime) sells = sells.filter((t) => t.time <= endTime);
    sells.sort((a, b) => b.time - a.time);
    const tol = Math.max(expectedQty * 0.08, 0.0001);
    for (const s of sells) {
      if (Math.abs(s.qty - expectedQty) <= tol || s.qty <= expectedQty + tol) {
        return s.price;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type CloseEvidence = "oco" | "myTrades" | "mark";

async function resolveUnbackedTradeClose(
  t: OpenTrade,
  settings: RuntimeSettings,
  priceFallback: number,
  opts: { closedAt?: Date } = {}
): Promise<{
  closedReason: "TP_HIT" | "SL_HIT" | "RECONCILED";
  exitPrice: number;
  detail: string;
  evidence: CloseEvidence;
}> {
  const pair = t.pair;
  const entry = t.entryPrice as number;
  const ex = getExchangeAdapterForTrade(settings, t);
  const assetClass = (t.assetClass as AssetClass) || "crypto";

  if (tradeExitBundle(t)) {
    const ocoFill = await filledExitFromOco(ex, pair, t, assetClass);
    if (ocoFill) {
      const closedReason = inferCloseReasonFromFill(entry, ocoFill.exitPrice, t.takeProfit, t.stopLoss);
      return {
        closedReason,
        exitPrice: ocoFill.exitPrice,
        detail: `Exit order filled (${ocoFill.orderId ?? "leg"}) @ ${ocoFill.exitPrice}`,
        evidence: "oco",
      };
    }
  }

  const qty = t.quantity as number;
  const tradeFill = await filledExitFromMyTrades(ex, pair, t.openedAt, qty, assetClass, opts.closedAt);
  if (tradeFill != null) {
    const closedReason = inferCloseReasonFromFill(entry, tradeFill, t.takeProfit, t.stopLoss);
    return {
      closedReason,
      exitPrice: tradeFill,
      detail: `Exchange SELL fill @ ${tradeFill}`,
      evidence: "myTrades",
    };
  }

  const px = priceFallback;
  if (t.takeProfit && px >= (t.takeProfit as number) * 0.995) {
    return {
      closedReason: "TP_HIT",
      exitPrice: px,
      detail: `Mark ${px} at/above TP ${t.takeProfit}`,
      evidence: "mark",
    };
  }
  if (t.stopLoss && px <= (t.stopLoss as number) * 1.005) {
    return {
      closedReason: "SL_HIT",
      exitPrice: px,
      detail: `Mark ${px} at/below SL ${t.stopLoss}`,
      evidence: "mark",
    };
  }

  const inferred = inferCloseReasonFromFill(entry, px, t.takeProfit, t.stopLoss);
  return {
    closedReason: inferred,
    exitPrice: px,
    detail: `Inferred ${inferred} from mark ${px}`,
    evidence: "mark",
  };
}

async function classifyAssetTrades(
  trades: OpenTrade[],
  balanceTotal: number,
  minQty: number,
  settings: RuntimeSettings
): Promise<{ keep: OpenTrade[]; close: OpenTrade[] }> {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.openedAt || 0).getTime() - new Date(b.openedAt || 0).getTime()
  );
  const keep: OpenTrade[] = [];
  const close: OpenTrade[] = [];
  let avail = balanceTotal;

  for (const t of sorted) {
    const expected = (t.quantity as number) || 0;

    if (tradeExitBundle(t)) {
      const ex = getExchangeAdapterForTrade(settings, t);
      const assetClass = (t.assetClass as AssetClass) || "crypto";
      const oco = await queryOcoState(ex, t.pair, t, assetClass);
      if (oco === "EXECUTING") {
        keep.push(t);
        avail = Math.max(0, avail - expected);
        continue;
      }
      if (oco === "ALL_DONE") {
        const fill = await filledExitFromOco(ex, t.pair, t, assetClass);
        if (fill) {
          close.push(t);
        } else {
          const need = Math.max(expected * 0.92, minQty);
          if (expected > 0 && avail + 1e-12 >= need) {
            keep.push(t);
            avail = Math.max(0, avail - expected);
          } else {
            close.push(t);
          }
        }
        continue;
      }
    }

    const need = Math.max(expected * 0.92, minQty);
    if (expected > 0 && avail + 1e-12 >= need) {
      keep.push(t);
      avail = Math.max(0, avail - expected);
    } else {
      close.push(t);
    }
  }

  return { keep, close };
}

/**
 * Syncs DB OPEN trades with Binance balances and OCO state.
 * Filled OCO → TP_HIT / SL_HIT. Multiple OPEN rows on same asset share balance (FIFO).
 */
export async function reconcileOpenTrades(
  userId: string,
  settings: RuntimeSettings
): Promise<{
  closed: ReconcileResult[];
  kept: number;
  errors: { pair: string; error: string }[];
}> {
  const open = (await Trade.find(userScope(userId, { status: "OPEN" })).lean()) as OpenTrade[];
  const closed: ReconcileResult[] = [];
  const errors: { pair: string; error: string }[] = [];
  let kept = 0;

  const live = open.filter((t) => !t.dryRun);
  kept += open.length - live.length;

  const byAsset = new Map<string, OpenTrade[]>();
  for (const t of live) {
    const base = getExchangeAdapterForTrade(settings, t).baseAssetOf(t.pair);
    if (!byAsset.has(base)) byAsset.set(base, []);
    byAsset.get(base)!.push(t);
  }

  const exDefault = getExchangeAdapter(settings);

  for (const [base, trades] of byAsset) {
    try {
      const balance = await exDefault.fetchAssetBalance(base);
      const sample = trades[0]!;
      const ex = getExchangeAdapterForTrade(settings, sample);
      const assetClass = (sample.assetClass as AssetClass) || "crypto";
      const samplePair = sample.pair;
      const [info, markPrice] = await Promise.all([
        ex.getSymbolInfo(samplePair, assetClass).catch(() => null),
        ex.fetchPrice(samplePair, assetClass).catch(() => sample.entryPrice as number),
      ]);
      const minQty = info?.minQty ?? 0;
      const minNotional = info?.minNotional ?? 0;
      const valueUsdc = balance.total * markPrice;

      let { keep, close: toClose } = await classifyAssetTrades(trades, balance.total, minQty, settings);

      const aggregateDust = balance.total < minQty || valueUsdc < minNotional;
      if (aggregateDust && keep.length === 0 && toClose.length === 0) {
        toClose = [...trades];
      }

      kept += keep.length;

      const seen = new Set<string>();
      for (const t of toClose) {
        const id = String(t._id);
        if (seen.has(id)) continue;
        seen.add(id);

        const pair = t.pair;
        try {
          const ex = getExchangeAdapterForTrade(settings, t);
          const assetClass = (t.assetClass as AssetClass) || "crypto";
          const bundle = tradeExitBundle(t);
          if (bundle) {
            try {
              await ex.cancelExitOrders(pair, bundle, assetClass);
            } catch {
              /* already gone */
            }
          }

          const price = (await ex.fetchPrice(pair, assetClass).catch(() => null)) ?? markPrice;
          const resolved = await resolveUnbackedTradeClose(t, settings, price);
          const entry = t.entryPrice as number;
          const qty = t.quantity as number;
          const { pnlUsdc, pnlPercent } = pnlFromExit(entry, resolved.exitPrice, qty);

          await Trade.findByIdAndUpdate(t._id, {
            $set: {
              status: "CLOSED",
              exitPrice: resolved.exitPrice,
              closedAt: new Date(),
              closedReason: resolved.closedReason,
              pnlUsdc,
              pnlPercent,
            },
          });

          await AILog.create({
            userId: toObjectId(userId),
            action: "RECONCILE",
            pair,
            decision: resolved.closedReason,
            reasoning: `Exchange sync: ${resolved.detail}`,
            executedTrade: false,
            tradeId: t._id,
            meta: {
              freeBalance: balance.free,
              lockedBalance: balance.locked,
              totalBalance: balance.total,
              expectedQty: qty,
              valueUsdc,
              minNotional,
            },
          });

          closed.push({
            pair,
            tradeId: id,
            freeBalance: balance.free,
            lockedBalance: balance.locked,
            totalBalance: balance.total,
            expectedQty: qty,
            reason: resolved.detail,
            closedReason: resolved.closedReason,
            exitPrice: resolved.exitPrice,
            pnlUsdc,
            pnlPercent,
          });
        } catch (err: any) {
          const msg = err?.message?.slice(0, 200) || String(err);
          errors.push({ pair, error: msg });
          kept++;
        }
      }
    } catch (err: any) {
      const msg = err?.message?.slice(0, 200) || String(err);
      console.warn(`[reconcile] ${base}: skipped group — ${msg}`);
      for (const t of trades) {
        errors.push({ pair: t.pair, error: msg });
        kept++;
      }
    }
  }

  if (closed.length > 0) {
    const summary = closed.reduce(
      (acc, c) => {
        acc[c.closedReason] = (acc[c.closedReason] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    console.log(`[reconcile] closed ${closed.length}:`, summary);
  }

  return { closed, kept, errors };
}

/** Re-label historical RECONCILED closes when Binance fill evidence exists. */
export async function reclassifyReconciledTrades(
  userId: string,
  settings: RuntimeSettings,
  opts: { limit?: number; since?: Date } = {}
): Promise<{ scanned: number; updated: number; skipped: number; samples: { pair: string; from: string; to: string }[] }> {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 5000);
  const filter: Record<string, unknown> = userScope(userId, { status: "CLOSED", closedReason: "RECONCILED" });
  if (opts.since) filter.closedAt = { $gte: opts.since };

  const trades = (await Trade.find(filter).sort({ closedAt: -1 }).limit(limit).lean()) as (OpenTrade & {
    closedAt?: Date;
    exitPrice?: number;
  })[];
  const samples: { pair: string; from: string; to: string }[] = [];
  let updated = 0;
  let skipped = 0;

  for (const t of trades) {
    const entry = t.entryPrice as number;
    const qty = t.quantity as number;
    const fallback = t.exitPrice ?? entry;
    const resolved = await resolveUnbackedTradeClose(t, settings, fallback, { closedAt: t.closedAt });

    if (resolved.evidence === "mark") {
      skipped++;
      continue;
    }

    const { pnlUsdc, pnlPercent } = pnlFromExit(entry, resolved.exitPrice, qty);
    await Trade.findByIdAndUpdate(t._id, {
      $set: {
        closedReason: resolved.closedReason,
        exitPrice: resolved.exitPrice,
        pnlUsdc,
        pnlPercent,
      },
    });
    updated++;
    if (samples.length < 12) {
      samples.push({ pair: t.pair, from: "RECONCILED", to: resolved.closedReason });
    }
  }

  return { scanned: trades.length, updated, skipped, samples };
}

/** Process all RECONCILED rows in batches (exchange-evidence only). */
export async function reclassifyAllReconciledTrades(
  userId: string,
  settings: RuntimeSettings,
  opts: { since?: Date; maxBatches?: number } = {}
): Promise<{ scanned: number; updated: number; skipped: number; batches: number }> {
  const maxBatches = opts.maxBatches ?? 20;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let batches = 0;

  for (let i = 0; i < maxBatches; i++) {
    const r = await reclassifyReconciledTrades(userId, settings, { limit: 500, since: opts.since });
    scanned += r.scanned;
    updated += r.updated;
    skipped += r.skipped;
    batches++;
    if (r.scanned === 0) break;
    if (r.updated === 0 && r.skipped === r.scanned) break;
  }

  return { scanned, updated, skipped, batches };
}
