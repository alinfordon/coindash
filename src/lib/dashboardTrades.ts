import type { FilterQuery } from "mongoose";
import type { TradeDoc } from "@/models/Trade";
import { toObjectId } from "@/lib/tenant";

/** Notional under this (USDC) is treated as dust and omitted from dashboard aggregates. */
export const DASHBOARD_DUST_MAX_USDC = 1;

/**
 * Closed trades that count toward dashboard P&L, win rate, and charts.
 * Excludes only sub-$1 notion (0 < usdcValue < 1). Trades without `usdcValue` stay included.
 */
export function dashboardClosedTradeMatch(userId: string): FilterQuery<TradeDoc> {
  return {
    userId: toObjectId(userId),
    status: "CLOSED",
    $nor: [{ usdcValue: { $gt: 0, $lt: DASHBOARD_DUST_MAX_USDC } }],
  };
}
