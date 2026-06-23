"use client";

import { toast } from "sonner";
import {
  ANALYSIS_INDICATOR_DEFS,
  type AnalysisIndicatorId,
  type AnalysisIndicatorsConfig,
} from "@/lib/analysisIndicators";
import { cn } from "@/lib/utils";

const SHORT_LABEL: Record<AnalysisIndicatorId, string> = {
  rsi: "RSI",
  macd: "MACD",
  ema: "EMA",
  bollinger: "BB",
  fibonacci: "FIB",
  elliottWave: "EW",
};

type Props = {
  value: AnalysisIndicatorsConfig;
  onChange: (next: AnalysisIndicatorsConfig) => void;
  className?: string;
};

export function IndicatorToggleChips({ value, onChange, className }: Props) {
  const enabledCount = Object.values(value).filter(Boolean).length;

  function toggle(id: AnalysisIndicatorId) {
    const next = !value[id];
    if (!next && enabledCount <= 1) {
      toast.error("Trebuie să rămână cel puțin un indicator activ.");
      return;
    }
    onChange({ ...value, [id]: next });
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {ANALYSIS_INDICATOR_DEFS.map(({ id, label, tip }) => {
        const on = value[id];
        return (
          <button
            key={id}
            type="button"
            title={tip}
            onClick={() => toggle(id)}
            className={cn(
              "chip text-[10px] mono transition-colors border",
              on
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/60 bg-surface-2/40 text-text-muted hover:border-border"
            )}
          >
            {SHORT_LABEL[id]}
            <span className="opacity-70 ml-1 hidden sm:inline">{label.replace(/ \(.*\)/, "")}</span>
          </button>
        );
      })}
    </div>
  );
}
