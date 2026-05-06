import type { FilterQuery } from "mongoose";
import type { TradeDoc } from "@/models/Trade";

/** Notional under this (USDC) is treated as dust and omitted from dashboard aggregates. */
export const DASHBOARD_DUST_MAX_USDC = 1;

/**
 * Closed trades that count toward dashboard P&L, win rate, and charts.
 * Excludes only sub-$1 notion (0 < usdcValue < 1). Trades without `usdcValue` stay included.
 */
export function dashboardClosedTradeMatch(): FilterQuery<TradeDoc> {
  return {
    status: "CLOSED",
    $nor: [{ usdcValue: { $gt: 0, $lt: DASHBOARD_DUST_MAX_USDC } }],
  };
}
