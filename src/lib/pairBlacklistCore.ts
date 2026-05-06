/** Safe to import from client bundles — no Node/Binance deps. */

export function normalizePairBlacklistEntries(raw: string[] | undefined | null): string[] {
  if (!raw || !Array.isArray(raw)) return [];
  return [...new Set(raw.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
}
