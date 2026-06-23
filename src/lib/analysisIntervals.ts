/** Binance kline intervals supported for technical analysis. */
export const ANALYSIS_INTERVALS = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
  "3d",
] as const;

export type AnalysisInterval = (typeof ANALYSIS_INTERVALS)[number];

export type KlineInterval = AnalysisInterval;

const INTERVAL_RANK: Record<AnalysisInterval, number> = {
  "1m": 1,
  "3m": 2,
  "5m": 3,
  "15m": 4,
  "30m": 5,
  "1h": 6,
  "2h": 7,
  "4h": 8,
  "6h": 9,
  "12h": 10,
  "1d": 11,
  "3d": 12,
};

export const ANALYSIS_INTERVAL_OPTIONS: { value: AnalysisInterval; label: string }[] = [
  { value: "1m", label: "1 minute" },
  { value: "3m", label: "3 minutes" },
  { value: "5m", label: "5 minutes" },
  { value: "15m", label: "15 minutes" },
  { value: "30m", label: "30 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "2h", label: "2 hours" },
  { value: "4h", label: "4 hours" },
  { value: "6h", label: "6 hours" },
  { value: "12h", label: "12 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
];

export function isAnalysisInterval(v: string): v is AnalysisInterval {
  return (ANALYSIS_INTERVALS as readonly string[]).includes(v);
}

export function normalizeAnalysisInterval(v: string | undefined, fallback: AnalysisInterval): AnalysisInterval {
  return v && isAnalysisInterval(v) ? v : fallback;
}

export function formatIntervalLabel(interval: AnalysisInterval): string {
  return ANALYSIS_INTERVAL_OPTIONS.find((o) => o.value === interval)?.label ?? interval.toUpperCase();
}

export function intervalRank(interval: AnalysisInterval): number {
  return INTERVAL_RANK[interval];
}

/** Entry timeframe must be same or shorter than trend timeframe. */
export function normalizeAnalysisIntervalPair(
  trend: string | undefined,
  entry: string | undefined
): { trend: AnalysisInterval; entry: AnalysisInterval } {
  const trendIv = normalizeAnalysisInterval(trend, "1h");
  let entryIv = normalizeAnalysisInterval(entry, "15m");
  if (intervalRank(entryIv) > intervalRank(trendIv)) {
    entryIv = trendIv;
  }
  return { trend: trendIv, entry: entryIv };
}

export function resolveAnalysisIntervals(settings: {
  analysisTrendInterval?: string;
  analysisEntryInterval?: string;
}): { trend: AnalysisInterval; entry: AnalysisInterval } {
  return normalizeAnalysisIntervalPair(settings.analysisTrendInterval, settings.analysisEntryInterval);
}

const INTERVAL_MINUTES: Record<AnalysisInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "12h": 720,
  "1d": 1440,
  "3d": 4320,
};

/** Candle count for ~N days of history on a given interval (capped for Binance kline limit). */
export function analysisLookbackCandles(interval: AnalysisInterval, targetDays = 7): number {
  const mins = INTERVAL_MINUTES[interval];
  const target = targetDays * 24 * 60;
  return Math.min(100, Math.max(20, Math.round(target / mins)));
}
