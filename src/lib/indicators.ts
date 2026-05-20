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

/** Return a snapshot of all indicators from the most recent candle. */
export function computeIndicatorSnapshot(closes: number[]) {
  const rsiArr = rsi(closes, 14);
  const { macdLine, signalLine, hist } = macd(closes, 12, 26, 9);
  const { upper, middle, lower } = bollinger(closes, 20, 2);
  const ema20Arr = ema(closes, 20);
  const ema50Arr = ema(closes, 50);
  const idx = closes.length - 1;
  const price = closes[idx];
  const ema20 = ema20Arr[idx];
  const ema50 = ema50Arr[idx];
  return {
    price,
    rsi: rsiArr[idx],
    macd: { value: macdLine[idx], signal: signalLine[idx], histogram: hist[idx] },
    bb: { upper: upper[idx], middle: middle[idx], lower: lower[idx] },
    ema20,
    ema50,
    priceVsEma20Pct: ema20 ? ((price - ema20) / ema20) * 100 : 0,
    priceVsEma50Pct: ema50 ? ((price - ema50) / ema50) * 100 : 0,
    trend5: trendDescription(closes.slice(-5)),
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

/** True when core 1h indicators are numeric (enough candle history). */
export function isIndicatorSnapshotValid(snap: ReturnType<typeof computeIndicatorSnapshot>): boolean {
  const n = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  return (
    n(snap.price) &&
    n(snap.rsi) &&
    n(snap.macd.value) &&
    n(snap.macd.signal) &&
    n(snap.macd.histogram) &&
    n(snap.ema20) &&
    n(snap.ema50)
  );
}
