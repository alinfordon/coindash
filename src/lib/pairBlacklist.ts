import { baseAssetOf } from "./binance";
import { normalizePairBlacklistEntries } from "./pairBlacklistCore";

export { normalizePairBlacklistEntries };

/** True when the symbol or its base asset matches a blacklist entry (e.g. BTC vs BTCUSDC). */
export function isPairBlacklisted(pair: string, blacklist: string[] | undefined | null): boolean {
  const list = normalizePairBlacklistEntries(blacklist);
  if (!list.length) return false;
  const p = pair.trim().toUpperCase();
  const base = baseAssetOf(p).toUpperCase();
  return list.some((e) => p === e || base === e);
}
