import {
  ema,
  bollinger,
  rsi,
  macd,
  computeFibonacciSnapshot,
  getElliottPivotMarkers,
} from "@/lib/indicators";
import {
  analysisLookbackCandles,
  isAnalysisInterval,
  type AnalysisInterval,
} from "@/lib/analysisIntervals";
import type { AnalysisIndicatorsConfig } from "@/lib/analysisIndicators";
import { DEFAULT_ANALYSIS_INDICATORS } from "@/lib/analysisIndicators";

export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartLinePoint = { time: number; value: number };

export type FibPriceLineSpec = {
  price: number;
  title: string;
  color: string;
  lineWidth: 1 | 2;
};

const FIB_STYLE: Record<string, { color: string; lineWidth: 1 | 2 }> = {
  "0.0": { color: "rgba(255, 200, 87, 0.85)", lineWidth: 2 },
  "0.236": { color: "rgba(180, 160, 120, 0.55)", lineWidth: 1 },
  "0.382": { color: "rgba(180, 160, 120, 0.65)", lineWidth: 1 },
  "0.5": { color: "rgba(0, 245, 255, 0.7)", lineWidth: 1 },
  "0.618": { color: "rgba(255, 107, 157, 0.85)", lineWidth: 2 },
  "0.786": { color: "rgba(180, 160, 120, 0.55)", lineWidth: 1 },
  "1.0": { color: "rgba(255, 200, 87, 0.85)", lineWidth: 2 },
};

export function toLineData(candles: ChartCandle[], values: number[]): ChartLinePoint[] {
  return candles
    .map((c, i) => ({ time: c.time, value: values[i] }))
    .filter((p) => Number.isFinite(p.value));
}

export function normalizeChartInterval(interval: string): AnalysisInterval {
  return isAnalysisInterval(interval) ? interval : "1h";
}

export function chartPaneLayout(cfg: AnalysisIndicatorsConfig) {
  const hasRsi = cfg.rsi;
  const hasMacd = cfg.macd;
  if (!hasRsi && !hasMacd) {
    return { main: { top: 0.06, bottom: 0.06 }, rsi: null, macd: null, totalHeight: 240 };
  }
  if (hasRsi && hasMacd) {
    return {
      main: { top: 0.06, bottom: 0.38 },
      rsi: { top: 0.66, bottom: 0.2 },
      macd: { top: 0.84, bottom: 0.02 },
      totalHeight: 360,
    };
  }
  if (hasRsi) {
    return {
      main: { top: 0.06, bottom: 0.28 },
      rsi: { top: 0.76, bottom: 0.04 },
      macd: null,
      totalHeight: 300,
    };
  }
  return {
    main: { top: 0.06, bottom: 0.28 },
    rsi: null,
    macd: { top: 0.76, bottom: 0.04 },
    totalHeight: 300,
  };
}

export function buildChartOverlays(candles: ChartCandle[], interval: string, cfg: AnalysisIndicatorsConfig) {
  const enabled = cfg ?? DEFAULT_ANALYSIS_INDICATORS;
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const iv = normalizeChartInterval(interval);
  const lookback = analysisLookbackCandles(iv);

  const ohlc = closes.map((close, i) => ({ close, high: highs[i], low: lows[i] }));
  const times = candles.map((c) => c.time);

  const ema20 = enabled.ema ? toLineData(candles, ema(closes, 20)) : [];
  const ema50 = enabled.ema ? toLineData(candles, ema(closes, 50)) : [];

  let bbUpper: ChartLinePoint[] = [];
  let bbMiddle: ChartLinePoint[] = [];
  let bbLower: ChartLinePoint[] = [];
  if (enabled.bollinger) {
    const bb = bollinger(closes, 20, 2);
    bbUpper = toLineData(candles, bb.upper);
    bbMiddle = toLineData(candles, bb.middle);
    bbLower = toLineData(candles, bb.lower);
  }

  const fibLines: FibPriceLineSpec[] = [];
  if (enabled.fibonacci) {
    const fib = computeFibonacciSnapshot(highs, lows, closes, lookback, iv);
    if (fib) {
      for (const [label, price] of Object.entries(fib.levels)) {
        const style = FIB_STYLE[label] ?? { color: "rgba(200,200,200,0.5)", lineWidth: 1 as const };
        fibLines.push({
          price,
          title: `Fib ${label === "0.618" ? "61.8%" : label === "0.382" ? "38.2%" : label}`,
          color: style.color,
          lineWidth: style.lineWidth,
        });
      }
    }
  }

  const elliottMarkers = enabled.elliottWave ? getElliottPivotMarkers(ohlc, times, lookback) : [];

  const rsiData = enabled.rsi ? toLineData(candles, rsi(closes, 14)) : [];
  const macdOut = enabled.macd ? macd(closes, 12, 26, 9) : null;
  const macdLine = macdOut ? toLineData(candles, macdOut.macdLine) : [];
  const macdSignal = macdOut ? toLineData(candles, macdOut.signalLine) : [];
  const macdHist = macdOut
    ? candles
        .map((c, i) => ({
          time: c.time,
          value: macdOut.hist[i],
          color: (macdOut.hist[i] ?? 0) >= 0 ? "rgba(0,255,136,0.55)" : "rgba(255,51,102,0.55)",
        }))
        .filter((p) => Number.isFinite(p.value))
    : [];

  return {
    ema20,
    ema50,
    bbUpper,
    bbMiddle,
    bbLower,
    fibLines,
    elliottMarkers,
    rsiData,
    macdLine,
    macdSignal,
    macdHist,
    layout: chartPaneLayout(enabled),
  };
}

export type ChartLegendItem = { color: string; label: string; dashed?: boolean };

export function chartLegendItems(cfg: AnalysisIndicatorsConfig): ChartLegendItem[] {
  const items: ChartLegendItem[] = [];
  if (cfg.ema) {
    items.push({ color: "#FFC857", label: "EMA 20" });
    items.push({ color: "#7B2FFF", label: "EMA 50" });
  }
  if (cfg.bollinger) items.push({ color: "#5A7A9A", label: "Bollinger", dashed: true });
  if (cfg.fibonacci) items.push({ color: "#FF6B9D", label: "Fibonacci" });
  if (cfg.elliottWave) items.push({ color: "#00D4FF", label: "Elliott pivoturi" });
  if (cfg.rsi) items.push({ color: "#00F5FF", label: "RSI (14)" });
  if (cfg.macd) {
    items.push({ color: "#00FF88", label: "MACD hist" });
    items.push({ color: "#FFC857", label: "MACD line" });
  }
  return items;
}
