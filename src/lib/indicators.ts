import type { AnalysisIndicatorsConfig } from "./analysisIndicators";
import { DEFAULT_ANALYSIS_INDICATORS } from "./analysisIndicators";

/** Simple technical indicator helpers. All inputs are arrays of closes (ascending time). */

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalP = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) => {
    if (Number.isNaN(emaFast[i]) || Number.isNaN(emaSlow[i])) return NaN;
    return emaFast[i] - emaSlow[i];
  });
  const macdValid = macdLine.map((v) => (Number.isNaN(v) ? 0 : v));
  const signalLine = ema(macdValid, signalP).map((v, i) => (Number.isNaN(macdLine[i]) ? NaN : v));
  const hist = macdLine.map((v, i) => (Number.isNaN(v) || Number.isNaN(signalLine[i]) ? NaN : v - signalLine[i]));
  return { macdLine, signalLine, hist };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const middle = sma(values, period);
  const upper: number[] = new Array(values.length).fill(NaN);
  const lower: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { upper, middle, lower };
}

export function last<T>(arr: T[]): T | undefined {
  return arr.length ? arr[arr.length - 1] : undefined;
}

export type FibonacciSnapshot = {
  interval?: string;
  lookbackCandles: number;
  swingHigh: number;
  swingLow: number;
  swingDirection: "up" | "down";
  levels: Record<string, number>;
  nearestLevel: string;
  retracementPct: number;
};

export type ElliottWaveSnapshot = {
  interval?: string;
  lookbackCandles: number;
  pivotCount: number;
  waveLegs: number;
  phase: "impulse_up" | "impulse_down" | "correction" | "unclear";
  lastMovePct: number;
  summary: string;
};

type Ohlc = { high: number; low: number; close: number };

export type IndicatorSnapshotOptions = {
  highs: number[];
  lows: number[];
  lookback?: number;
  interval?: string;
  computeFibonacci?: boolean;
  computeElliottWave?: boolean;
};

/** Fibonacci retracement on the recent swing high/low (lookback candles). */
export function computeFibonacciSnapshot(
  highs: number[],
  lows: number[],
  closes: number[],
  lookback = 50,
  interval?: string
): FibonacciSnapshot | null {
  const n = closes.length;
  if (n < 10) return null;
  const start = Math.max(0, n - lookback);
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  for (let i = start; i < n; i++) {
    if (highs[i] > swingHigh) swingHigh = highs[i];
    if (lows[i] < swingLow) swingLow = lows[i];
  }
  const range = swingHigh - swingLow;
  if (!Number.isFinite(range) || range <= 0) return null;

  const price = closes[n - 1];
  const mid = (swingHigh + swingLow) / 2;
  const swingDirection: "up" | "down" = price >= mid ? "up" : "down";

  const ratios = ["0.236", "0.382", "0.5", "0.618", "0.786"] as const;
  const levels: Record<string, number> = {
    "0.0": swingHigh,
    "1.0": swingLow,
  };
  for (const r of ratios) {
    levels[r] = swingHigh - range * Number(r);
  }

  let nearestLevel = "0.0";
  let nearestDist = Infinity;
  for (const [label, lvl] of Object.entries(levels)) {
    const dist = Math.abs(price - lvl);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestLevel = label;
    }
  }

  const retracementPct = swingDirection === "up" ? ((swingHigh - price) / range) * 100 : ((price - swingLow) / range) * 100;

  return {
    interval,
    lookbackCandles: n - start,
    swingHigh,
    swingLow,
    swingDirection,
    levels,
    nearestLevel,
    retracementPct: Math.max(0, Math.min(100, retracementPct)),
  };
}

function localPivots(candles: Ohlc[], window = 2): { idx: number; price: number; kind: "high" | "low" }[] {
  const pivots: { idx: number; price: number; kind: "high" | "low" }[] = [];
  for (let i = window; i < candles.length - window; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) pivots.push({ idx: i, price: candles[i].high, kind: "high" });
    else if (isLow) pivots.push({ idx: i, price: candles[i].low, kind: "low" });
  }
  return pivots;
}

export type ChartPivotMarker = {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "circle";
  size: number;
};

/** Pivot markers for Elliott Wave overlay on price chart. */
export function getElliottPivotMarkers(
  candles: Ohlc[],
  candleTimes: number[],
  lookback = 60
): ChartPivotMarker[] {
  if (candles.length !== candleTimes.length || candles.length < 10) return [];
  const slice = candles.slice(-lookback);
  const times = candleTimes.slice(-lookback);
  const pivots = localPivots(slice, 2);
  return pivots.map((p) => ({
    time: times[p.idx],
    position: p.kind === "high" ? "aboveBar" : "belowBar",
    color: p.kind === "high" ? "#FF6B9D" : "#00D4FF",
    shape: "circle",
    size: 0.6,
  }));
}

/** Simplified Elliott-style read: pivot structure and impulse vs correction hint. */
export function computeElliottWaveSnapshot(
  candles: Ohlc[],
  lookback = 60,
  interval?: string
): ElliottWaveSnapshot | null {
  if (candles.length < 20) return null;
  const slice = candles.slice(-lookback);
  const pivots = localPivots(slice, 2);
  if (pivots.length < 3) {
    return {
      interval,
      lookbackCandles: slice.length,
      pivotCount: pivots.length,
      waveLegs: 0,
      phase: "unclear",
      lastMovePct: 0,
      summary: "insufficient pivot structure",
    };
  }

  const recent = pivots.slice(-6);
  const waveLegs = Math.max(0, recent.length - 1);
  let upLegs = 0;
  let downLegs = 0;
  for (let i = 1; i < recent.length; i++) {
    const pct = ((recent[i].price - recent[i - 1].price) / recent[i - 1].price) * 100;
    if (pct > 0.3) upLegs++;
    else if (pct < -0.3) downLegs++;
  }

  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  const lastMovePct = ((last.price - prev.price) / prev.price) * 100;

  let phase: ElliottWaveSnapshot["phase"] = "unclear";
  if (upLegs > downLegs && lastMovePct > 0) phase = "impulse_up";
  else if (downLegs > upLegs && lastMovePct < 0) phase = "impulse_down";
  else if (Math.abs(lastMovePct) < 1.5 && waveLegs >= 3) phase = "correction";

  const summary =
    phase === "impulse_up"
      ? `${waveLegs} legs, bullish impulse bias`
      : phase === "impulse_down"
        ? `${waveLegs} legs, bearish impulse bias`
        : phase === "correction"
          ? `${waveLegs} legs, corrective structure`
          : `${waveLegs} legs, mixed structure`;

  return {
    interval,
    lookbackCandles: slice.length,
    pivotCount: pivots.length,
    waveLegs,
    phase,
    lastMovePct,
    summary,
  };
}

function toOhlcSeries(closes: number[], highs: number[], lows: number[]): Ohlc[] {
  return closes.map((close, i) => ({ close, high: highs[i], low: lows[i] }));
}

/** Return a snapshot of all indicators from the most recent candle. */
export function computeIndicatorSnapshot(closes: number[], ohlc?: IndicatorSnapshotOptions) {
  const rsiArr = rsi(closes, 14);
  const { macdLine, signalLine, hist } = macd(closes, 12, 26, 9);
  const { upper, middle, lower } = bollinger(closes, 20, 2);
  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, 50);
  const idx = closes.length - 1;
  const price = closes[idx];
  const ema20 = ema20Arr[idx];
  const ema50 = ema50Arr[idx];

  const lookback = ohlc?.lookback ?? 50;
  const hasOhlc =
    ohlc &&
    ohlc.highs.length === closes.length &&
    ohlc.lows.length === closes.length;

  const fibonacci =
    hasOhlc && ohlc.computeFibonacci !== false
      ? computeFibonacciSnapshot(ohlc.highs, ohlc.lows, closes, lookback, ohlc.interval)
      : null;

  const elliottWave =
    hasOhlc && ohlc.computeElliottWave !== false
      ? computeElliottWaveSnapshot(
          toOhlcSeries(closes, ohlc.highs, ohlc.lows),
          lookback,
          ohlc.interval
        )
      : null;

  return {
    price,
    interval: ohlc?.interval,
    lookbackCandles: lookback,
    rsi: rsiArr[idx],
    macd: { value: macdLine[idx], signal: signalLine[idx], histogram: hist[idx] },
    bb: { upper: upper[idx], middle: middle[idx], lower: lower[idx] },
    ema20,
    ema50,
    priceVsEma20Pct: ema20 ? ((price - ema20) / ema20) * 100 : 0,
    priceVsEma50Pct: ema50 ? ((price - ema50) / ema50) * 100 : 0,
    trend5: trendDescription(closes.slice(-5)),
    fibonacci,
    elliottWave,
  };
}

export function trendDescription(vals: number[]): string {
  if (vals.length < 2) return "flat";
  const first = vals[0];
  const last = vals[vals.length - 1];
  const pct = ((last - first) / first) * 100;
  if (pct > 1) return "rising";
  if (pct < -1) return "falling";
  return "sideways";
}

/** True when enabled indicators have enough numeric data (enough candle history). */
export function isIndicatorSnapshotValid(
  snap: ReturnType<typeof computeIndicatorSnapshot>,
  enabled: AnalysisIndicatorsConfig = DEFAULT_ANALYSIS_INDICATORS
): boolean {
  const n = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!n(snap.price)) return false;
  if (enabled.rsi && !n(snap.rsi)) return false;
  if (enabled.macd && (!n(snap.macd.value) || !n(snap.macd.signal) || !n(snap.macd.histogram))) return false;
  if (enabled.ema && (!n(snap.ema20) || !n(snap.ema50))) return false;
  if (enabled.bollinger && (!n(snap.bb.upper) || !n(snap.bb.middle) || !n(snap.bb.lower))) return false;
  if (enabled.fibonacci && !snap.fibonacci) return false;
  if (enabled.elliottWave && !snap.elliottWave) return false;
  return Object.values(enabled).some(Boolean);
}
