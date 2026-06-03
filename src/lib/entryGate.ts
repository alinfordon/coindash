import { Trade } from "@/models/Trade";
import { formatIntervalLabel, resolveAnalysisIntervals } from "@/lib/analysisIntervals";

export type EntryGateConfig = {
  entryGateEnabled: boolean;
  minTechnicalScore: number;
  requireStrongBuyOnly: boolean;
  maxPump24hPct: number;
  slCooldownMinutes: number;
  tpReopenCooldownMinutes: number;
  defaultReopenCooldownMinutes: number;
  analysisTrendInterval: string;
  analysisEntryInterval: string;
};

export type EntryCandidate = {
  pair: string;
  recommendation: string;
  confidence: number;
  technicalScore: number;
  price?: number;
  indicators?: {
    rsi?: number;
    macd?: { histogram?: number };
    ema20?: number;
    rsi15m?: number;
    macdHist15m?: number;
    trend15m?: string;
    priceChange24h?: number;
  };
};

export const DEFAULT_ENTRY_GATE: EntryGateConfig = {
  entryGateEnabled: true,
  minTechnicalScore: 40,
  requireStrongBuyOnly: false,
  maxPump24hPct: 15,
  slCooldownMinutes: 120,
  tpReopenCooldownMinutes: 30,
  defaultReopenCooldownMinutes: 30,
  analysisTrendInterval: "1h",
  analysisEntryInterval: "15m",
};

/** Balanced entry rules: AI signal + local technical confluence (trend + entry timeframes). */
export function passesEntryGate(
  c: EntryCandidate,
  config: EntryGateConfig
): { ok: boolean; reason: string } {
  if (!config.entryGateEnabled) return { ok: true, reason: "gate disabled" };

  const { trend, entry } = resolveAnalysisIntervals(config);
  const trendLabel = formatIntervalLabel(trend);
  const entryLabel = formatIntervalLabel(entry);

  const rec = c.recommendation;
  if (rec !== "BUY" && rec !== "STRONG_BUY") {
    return { ok: false, reason: "not a buy signal" };
  }
  if (config.requireStrongBuyOnly && rec !== "STRONG_BUY") {
    return { ok: false, reason: "STRONG_BUY required" };
  }

  const minScore = rec === "STRONG_BUY" ? Math.max(30, config.minTechnicalScore - 10) : config.minTechnicalScore;
  const score = c.technicalScore ?? 0;
  if (score < minScore) {
    return { ok: false, reason: `technicalScore ${score} < ${minScore}` };
  }

  const ind = c.indicators ?? {};
  const price = c.price ?? 0;
  const ema20 = ind.ema20;
  const macdHist1h = ind.macd?.histogram;
  const rsi15 = ind.rsi15m;
  const trend15 = ind.trend15m;
  const ch24 = ind.priceChange24h;

  if (ema20 != null && price > 0 && price < ema20 * 0.997) {
    return { ok: false, reason: `price below EMA20 (${trendLabel})` };
  }
  if (macdHist1h != null && macdHist1h < 0) {
    return { ok: false, reason: `MACD histogram negative (${trendLabel})` };
  }
  if (rsi15 != null && Number.isFinite(rsi15) && (rsi15 < 35 || rsi15 > 70)) {
    return { ok: false, reason: `RSI ${entryLabel} out of range (${rsi15.toFixed(1)})` };
  }
  if (trend15 === "falling") {
    return { ok: false, reason: `${entryLabel} trend falling` };
  }
  if (ch24 != null && ch24 > config.maxPump24hPct) {
    return { ok: false, reason: `24h pump +${ch24.toFixed(1)}%` };
  }

  return { ok: true, reason: "ok" };
}

/** STRONG_BUY first, then confidence, then technicalScore. */
export function compareBuyCandidates(a: EntryCandidate, b: EntryCandidate): number {
  const recRank = (r: string) => (r === "STRONG_BUY" ? 0 : r === "BUY" ? 1 : 2);
  const dr = recRank(a.recommendation) - recRank(b.recommendation);
  if (dr !== 0) return dr;
  const dc = (b.confidence ?? 0) - (a.confidence ?? 0);
  if (dc !== 0) return dc;
  return (b.technicalScore ?? 0) - (a.technicalScore ?? 0);
}

export async function pairReopenBlocked(
  userId: string,
  pair: string,
  config: Pick<EntryGateConfig, "slCooldownMinutes" | "tpReopenCooldownMinutes" | "defaultReopenCooldownMinutes">
): Promise<{ blocked: boolean; reason?: string }> {
  const recent = await Trade.findOne({ userId, pair, status: "CLOSED" }).sort({ closedAt: -1 }).lean();
  if (!recent?.closedAt) return { blocked: false };

  const elapsedMs = Date.now() - new Date(recent.closedAt).getTime();
  const closedReason = recent.closedReason as string | undefined;
  let requiredMs: number;
  if (closedReason === "SL_HIT") requiredMs = config.slCooldownMinutes * 60_000;
  else if (closedReason === "TP_HIT") requiredMs = config.tpReopenCooldownMinutes * 60_000;
  else requiredMs = config.defaultReopenCooldownMinutes * 60_000;

  if (elapsedMs < requiredMs) {
    const left = Math.ceil((requiredMs - elapsedMs) / 60_000);
    return { blocked: true, reason: `${closedReason ?? "CLOSE"} cooldown (${left}m left)` };
  }
  return { blocked: false };
}

export function entryGateFromSettings(settings: {
  entryGateEnabled?: boolean;
  minTechnicalScore?: number;
  requireStrongBuyOnly?: boolean;
  maxPump24hPct?: number;
  slCooldownMinutes?: number;
  tpReopenCooldownMinutes?: number;
  defaultReopenCooldownMinutes?: number;
  analysisTrendInterval?: string;
  analysisEntryInterval?: string;
}): EntryGateConfig {
  const { trend, entry } = resolveAnalysisIntervals(settings);
  return {
    entryGateEnabled: settings.entryGateEnabled ?? DEFAULT_ENTRY_GATE.entryGateEnabled,
    minTechnicalScore: settings.minTechnicalScore ?? DEFAULT_ENTRY_GATE.minTechnicalScore,
    requireStrongBuyOnly: settings.requireStrongBuyOnly ?? DEFAULT_ENTRY_GATE.requireStrongBuyOnly,
    maxPump24hPct: settings.maxPump24hPct ?? DEFAULT_ENTRY_GATE.maxPump24hPct,
    slCooldownMinutes: settings.slCooldownMinutes ?? DEFAULT_ENTRY_GATE.slCooldownMinutes,
    tpReopenCooldownMinutes: settings.tpReopenCooldownMinutes ?? DEFAULT_ENTRY_GATE.tpReopenCooldownMinutes,
    defaultReopenCooldownMinutes:
      settings.defaultReopenCooldownMinutes ?? DEFAULT_ENTRY_GATE.defaultReopenCooldownMinutes,
    analysisTrendInterval: trend,
    analysisEntryInterval: entry,
  };
}
