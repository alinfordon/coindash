import type { AnalysisIndicatorsConfig } from "./analysisIndicators";

export type AnalysisIndicatorsData = {
  rsi?: number;
  macd?: { value?: number; signal?: number; histogram?: number };
  bb?: { upper?: number; middle?: number; lower?: number };
  ema20?: number;
  ema50?: number;
  priceChange24h?: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  trendInterval?: string;
  entryInterval?: string;
  entryRsi?: number;
  entryMacdHist?: number;
  entryTrend5?: string;
  rsi15m?: number;
  macdHist15m?: number;
  trend15m?: string;
  fibonacci?: {
    swingHigh?: number;
    swingLow?: number;
    swingDirection?: string;
    nearestLevel?: string;
    retracementPct?: number;
    levels?: Record<string, number>;
    lookbackCandles?: number;
  } | null;
  fibonacciEntry?: AnalysisIndicatorsData["fibonacci"];
  elliottWave?: {
    phase?: string;
    waveLegs?: number;
    pivotCount?: number;
    lastMovePct?: number;
    summary?: string;
    lookbackCandles?: number;
  } | null;
  elliottWaveEntry?: AnalysisIndicatorsData["elliottWave"];
};

export type AnalysisListItem = {
  _id: string;
  pair: string;
  analyzedAt: string;
  interval?: string;
  entryInterval?: string;
  recommendation: string;
  confidence: number;
  technicalScore?: number;
  price?: number;
  reasoning?: string;
  keyFactors?: string[];
  riskLevel?: string;
  aiProvider?: string;
  aiModel?: string;
  indicators?: AnalysisIndicatorsData;
};

export type AnalysisDisplayContext = {
  trendTf: string;
  entryTf: string;
  visible: AnalysisIndicatorsConfig;
  visibleKey?: string;
};
