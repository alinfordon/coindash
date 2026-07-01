import type { ExitOrderBundle } from "./types";

type TradeLike = {
  ocoOrderId?: string | null;
  exitOrderIds?: string[] | null;
};

export function tradeExitBundle(trade: TradeLike): ExitOrderBundle | null {
  if (trade.ocoOrderId) return { kind: "oco", ocoOrderId: String(trade.ocoOrderId) };
  const ids = (trade.exitOrderIds || []).filter(Boolean);
  if (ids.length) return { kind: "dual", orderIds: ids.map(String) };
  return null;
}

export function bundleOrderIds(bundle: ExitOrderBundle): string[] {
  if (bundle.kind === "oco") return [bundle.ocoOrderId];
  return bundle.orderIds;
}
