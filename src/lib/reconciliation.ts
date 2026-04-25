import { Trade } from "@/models/Trade";
import { AILog } from "@/models/AILog";
import {
  baseAssetOf,
  fetchAssetBalance,
  fetchPrice,
  getSymbolInfo,
  cancelOco,
} from "./binance";
import type { RuntimeSettings } from "./settings";

export type ReconcileResult = {
  pair: string;
  tradeId: string;
  freeBalance: number;
  lockedBalance: number;
  totalBalance: number;
  expectedQty: number;
  reason: string;
  exitPrice: number;
  pnlUsdc: number;
  pnlPercent: number;
};

/**
 * Walks every DB trade marked as OPEN and verifies it against the actual
 * Binance balance for the base asset. If the on-exchange balance is below
 * the symbol's minQty/minNotional (i.e. effectively dust), the trade is
 * considered already closed by the exchange (most often via OCO TP/SL that
 * fired without our DB being updated) and we close it locally.
 *
 * Live (non-dry-run) trades only — dry-run trades have no on-chain footprint.
 */
export async function reconcileOpenTrades(settings: RuntimeSettings): Promise<{
  closed: ReconcileResult[];
  kept: number;
  errors: { pair: string; error: string }[];
}> {
  const open = await Trade.find({ status: "OPEN" }).lean();
  const closed: ReconcileResult[] = [];
  const errors: { pair: string; error: string }[] = [];
  let kept = 0;

  for (const t of open) {
    if (t.dryRun) {
      kept++;
      continue;
    }
    const pair = t.pair as string;
    try {
      const base = baseAssetOf(pair);
      // CRITICAL: use TOTAL balance (free + locked). When an OCO is active,
      // the asset is sitting in `locked`, not `free`. Treating `free` alone
      // as the position size would wrongly mark every active OCO trade as
      // dust. Also, throw on failure rather than silently treating as 0.
      const balance = await fetchAssetBalance(base, settings.binanceTestnet);
      const [info, price] = await Promise.all([
        getSymbolInfo(pair, settings.binanceTestnet).catch(() => null),
        fetchPrice(pair, settings.binanceTestnet).catch(() => t.entryPrice as number),
      ]);

      const expected = t.quantity as number;
      const minQty = info?.minQty ?? 0;
      const minNotional = info?.minNotional ?? 0;
      const valueUsdc = balance.total * price;

      // "Dust" = either the wallet has less than minQty of the base asset, or
      // the dollar value is below the exchange's minNotional, which means we
      // can no longer sell it on the market. Either way the position is
      // effectively flat on the exchange.
      const isDust = balance.total < minQty || valueUsdc < minNotional;
      // Also treat as closed if the actual balance is significantly smaller
      // than the trade's expected quantity (>95% missing) — this catches
      // OCO TP/SL fills that left only fee-rounding dust.
      const isMostlyGone = expected > 0 && balance.total / expected < 0.05;

      if (!isDust && !isMostlyGone) {
        kept++;
        continue;
      }

      // Best-effort: cancel any standing OCO (might already be filled, that's OK).
      if (t.ocoOrderId) {
        try {
          await cancelOco(pair, t.ocoOrderId as string, settings.binanceTestnet);
        } catch {
          /* OCO already gone — fine */
        }
      }

      const entry = t.entryPrice as number;
      const qty = expected;
      const pnlUsdc = +((price - entry) * qty).toFixed(4);
      const pnlPercent = +(((price - entry) / entry) * 100).toFixed(4);
      const reasonLabel = isDust
        ? `dust on Binance (free=${balance.free}, locked=${balance.locked}, value=$${valueUsdc.toFixed(4)}, minNotional=$${minNotional})`
        : `position mostly gone on Binance (free=${balance.free}, locked=${balance.locked}, expected=${expected})`;

      await Trade.findByIdAndUpdate(t._id, {
        $set: {
          status: "CLOSED",
          exitPrice: price,
          closedAt: new Date(),
          closedReason: "RECONCILED",
          pnlUsdc,
          pnlPercent,
        },
      });

      await AILog.create({
        action: "RECONCILE",
        pair,
        decision: "AUTO_CLOSED",
        reasoning: `Auto-closed during reconciliation: ${reasonLabel}`,
        executedTrade: false,
        tradeId: t._id,
        meta: {
          freeBalance: balance.free,
          lockedBalance: balance.locked,
          totalBalance: balance.total,
          expectedQty: expected,
          valueUsdc,
          minNotional,
        },
      });

      closed.push({
        pair,
        tradeId: String(t._id),
        freeBalance: balance.free,
        lockedBalance: balance.locked,
        totalBalance: balance.total,
        expectedQty: expected,
        reason: reasonLabel,
        exitPrice: price,
        pnlUsdc,
        pnlPercent,
      });
    } catch (err: any) {
      // IMPORTANT: on any error (e.g. balance fetch fails), DO NOT close the
      // trade — uncertain data must never trigger destructive action.
      const msg = err?.message?.slice(0, 200) || String(err);
      console.warn(`[reconcile] ${pair}: skipped due to error — ${msg}`);
      errors.push({ pair, error: msg });
      kept++;
    }
  }

  if (closed.length > 0) {
    console.log(`[reconcile] auto-closed ${closed.length} ghost/dust trade(s):`, closed.map((c) => c.pair).join(", "));
  }

  return { closed, kept, errors };
}
