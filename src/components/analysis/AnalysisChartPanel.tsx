"use client";

import { useEffect, useMemo, useState } from "react";
import { MiniCandles, type ChartPriceLine } from "@/components/analysis/MiniChart";
import { IndicatorToggleChips } from "@/components/analysis/IndicatorToggleChips";
import {
  DEFAULT_ANALYSIS_INDICATORS,
  normalizeAnalysisIndicators,
  type AnalysisIndicatorsConfig,
} from "@/lib/analysisIndicators";
import { normalizeAnalysisInterval } from "@/lib/analysisIntervals";

type Props = {
  symbol: string;
  testnet?: boolean;
  exchange?: "binance" | "kraken";
  /** Starting candle interval (user can change via picker). */
  defaultInterval?: string;
  initialIndicators?: AnalysisIndicatorsConfig;
  /** Reset toggles when this key changes (e.g. settings sync). */
  indicatorsResetKey?: string;
  priceLines?: ChartPriceLine[];
  showIntervalPicker?: boolean;
};

export function AnalysisChartPanel({
  symbol,
  testnet = false,
  exchange = "binance",
  defaultInterval = "1h",
  initialIndicators,
  indicatorsResetKey,
  priceLines,
  showIntervalPicker = true,
}: Props) {
  const normalizedInitial = useMemo(
    () => normalizeAnalysisIndicators(initialIndicators ?? DEFAULT_ANALYSIS_INDICATORS),
    [initialIndicators]
  );
  const initialKey = indicatorsResetKey ?? JSON.stringify(normalizedInitial);

  const [indicators, setIndicators] = useState(normalizedInitial);
  const interval = normalizeAnalysisInterval(defaultInterval, "1h");
  const chartKey = `${symbol}-${interval}-${JSON.stringify(indicators)}-${initialKey}`;

  useEffect(() => {
    setIndicators(normalizedInitial);
  }, [initialKey]);

  return (
    <div className="space-y-2">
      <IndicatorToggleChips value={indicators} onChange={setIndicators} />
      <MiniCandles
        key={chartKey}
        symbol={symbol}
        testnet={testnet}
        exchange={exchange}
        interval={interval}
        indicators={indicators}
        showIntervalPicker={showIntervalPicker}
        priceLines={priceLines}
      />
    </div>
  );
}

/** Controlled variant — parent owns indicator state (for metrics grid sync). */
type ControlledProps = Omit<Props, "initialIndicators" | "indicatorsResetKey"> & {
  indicators: AnalysisIndicatorsConfig;
  onIndicatorsChange: (next: AnalysisIndicatorsConfig) => void;
};

export function AnalysisChartPanelControlled({
  indicators,
  onIndicatorsChange,
  symbol,
  testnet,
  exchange = "binance",
  defaultInterval = "1h",
  priceLines,
  showIntervalPicker = true,
}: ControlledProps) {
  const interval = normalizeAnalysisInterval(defaultInterval, "1h");
  const chartKey = `${symbol}-${interval}-${JSON.stringify(indicators)}`;

  return (
    <div className="space-y-2">
      <IndicatorToggleChips value={indicators} onChange={onIndicatorsChange} />
      <MiniCandles
        key={chartKey}
        symbol={symbol}
        testnet={testnet}
        exchange={exchange}
        interval={interval}
        indicators={indicators}
        showIntervalPicker={showIntervalPicker}
        priceLines={priceLines}
      />
    </div>
  );
}
