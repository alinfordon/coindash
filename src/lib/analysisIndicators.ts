/** Which TA modules are sent to the AI analysis prompt (Settings → Setări). */

export type AnalysisIndicatorId =
  | "rsi"
  | "macd"
  | "ema"
  | "bollinger"
  | "fibonacci"
  | "elliottWave";

export type AnalysisIndicatorsConfig = Record<AnalysisIndicatorId, boolean>;

export const ANALYSIS_INDICATOR_DEFS: {
  id: AnalysisIndicatorId;
  label: string;
  tip: string;
  /** trend = only trend TF; both = trend + entry TF when enabled */
  scope: "trend" | "both";
}[] = [
  {
    id: "rsi",
    label: "RSI (14)",
    scope: "both",
    tip: "Relative Strength Index pe timeframe trend și pe timeframe entry (din setări).",
  },
  {
    id: "macd",
    label: "MACD",
    scope: "both",
    tip: "MACD (linie, semnal, histogramă) pe trend și entry — timeframes din setări.",
  },
  {
    id: "ema",
    label: "EMA 20 / 50",
    scope: "both",
    tip: "EMA 20/50 pe trend; distanța preț vs EMA20 și pe entry pentru timing.",
  },
  {
    id: "bollinger",
    label: "Bollinger Bands",
    scope: "trend",
    tip: "Benzi de volatilitate (20, 2σ) pe timeframe trend.",
  },
  {
    id: "fibonacci",
    label: "Fibonacci",
    scope: "both",
    tip: "Retracement Fibonacci pe swing recent (~7 zile de candle-uri) — trend și entry.",
  },
  {
    id: "elliottWave",
    label: "Elliott Wave",
    scope: "both",
    tip: "Structură Elliott simplificată (pivoturi, valuri) pe trend și entry.",
  },
];

export const DEFAULT_ANALYSIS_INDICATORS: AnalysisIndicatorsConfig = {
  rsi: true,
  macd: true,
  ema: true,
  bollinger: true,
  fibonacci: false,
  elliottWave: false,
};

export function normalizeAnalysisIndicators(raw: unknown): AnalysisIndicatorsConfig {
  const out = { ...DEFAULT_ANALYSIS_INDICATORS };
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const { id } of ANALYSIS_INDICATOR_DEFS) {
    if (id in src) out[id] = src[id] === true;
  }
  return out;
}

export function hasEnabledAnalysisIndicator(cfg: AnalysisIndicatorsConfig): boolean {
  return Object.values(cfg).some(Boolean);
}

/** Indicators computed on the entry timeframe when enabled. */
export function enabledForEntryTimeframe(cfg: AnalysisIndicatorsConfig): AnalysisIndicatorsConfig {
  return {
    rsi: cfg.rsi,
    macd: cfg.macd,
    ema: cfg.ema,
    bollinger: false,
    fibonacci: cfg.fibonacci,
    elliottWave: cfg.elliottWave,
  };
}

export function needsEntryTimeframeIndicators(cfg: AnalysisIndicatorsConfig): boolean {
  const e = enabledForEntryTimeframe(cfg);
  return Object.values(e).some(Boolean);
}
