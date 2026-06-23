"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ShoppingCart, Sparkles } from "lucide-react";
import { AnalysisChartPanelControlled } from "@/components/analysis/AnalysisChartPanel";
import { AnalysisMetricsGrid } from "@/components/analysis/AnalysisMetricsGrid";
import type { AnalysisDisplayContext, AnalysisListItem } from "@/lib/analysisDisplayTypes";
import { normalizeAnalysisIndicators } from "@/lib/analysisIndicators";
import { cn, fmtNum, fmtUsd } from "@/lib/utils";

const recColor: Record<string, string> = {
  STRONG_BUY: "border-success text-success",
  BUY: "border-success/60 text-success",
  HOLD: "border-border text-text-muted",
  SELL: "border-danger/60 text-danger",
  STRONG_SELL: "border-danger text-danger",
};

function summaryChips(item: AnalysisListItem, ctx: AnalysisDisplayContext) {
  const ind = item.indicators ?? {};
  const parts: string[] = [];
  if (ctx.visible.rsi && ind.rsi != null) parts.push(`RSI ${fmtNum(ind.rsi, 0)}`);
  if (ctx.visible.macd && ind.macd?.histogram != null) {
    parts.push(`MACD ${fmtNum(ind.macd.histogram, 3)}`);
  }
  if (ctx.visible.ema && ind.ema20 != null) parts.push(`EMA20 ${fmtNum(ind.ema20, 2)}`);
  return parts;
}

type Props = {
  item: AnalysisListItem;
  expanded: boolean;
  onToggle: () => void;
  onBuy: () => void;
  ctx: AnalysisDisplayContext;
  testnet: boolean;
  formattedAt?: string;
};

export function AnalysisListRow({ item, expanded, onToggle, onBuy, ctx, testnet, formattedAt }: Props) {
  const summary = summaryChips(item, ctx);
  const [chartIndicators, setChartIndicators] = useState(() => normalizeAnalysisIndicators(ctx.visible));

  useEffect(() => {
    setChartIndicators(normalizeAnalysisIndicators(ctx.visible));
  }, [ctx.visibleKey]);

  const metricsCtx = { trendTf: ctx.trendTf, entryTf: ctx.entryTf, visible: chartIndicators };

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <div className="flex items-stretch gap-2 px-3 sm:px-4 py-3 hover:bg-surface-2/20 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 min-w-0 items-center gap-2 sm:gap-3 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-text-muted transition-transform",
              expanded && "rotate-180"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="font-heading font-semibold text-sm sm:text-base">{item.pair}</span>
              <span
                className={cn(
                  "chip border text-[10px]",
                  recColor[item.recommendation] || "border-border text-text-muted"
                )}
              >
                {item.recommendation}
              </span>
              <span className="chip border-primary/30 text-primary text-[10px]">
                <Sparkles className="h-3 w-3" /> {item.confidence}%
              </span>
              {item.technicalScore != null && (
                <span className="chip border-border text-text-muted text-[10px] mono hidden xs:inline-flex">
                  TA {item.technicalScore > 0 ? "+" : ""}
                  {item.technicalScore}
                </span>
              )}
            </div>
            <div className="text-[10px] mono text-text-muted mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              {formattedAt && <span>{formattedAt}</span>}
              <span>
                {item.price != null ? fmtUsd(item.price, 4) : "—"} · {ctx.trendTf}/{ctx.entryTf}
              </span>
              {summary.length > 0 && !expanded && (
                <span className="text-text-muted/80 hidden md:inline">{summary.join(" · ")}</span>
              )}
            </div>
          </div>
        </button>
        <button
          type="button"
          className="chip border-success/50 text-success hover:bg-success/10 transition-colors shrink-0 self-center h-8"
          onClick={(e) => {
            e.stopPropagation();
            onBuy();
          }}
        >
          <ShoppingCart className="h-3 w-3" /> BUY
        </button>
      </div>

      {expanded && (
        <div className="px-3 sm:px-4 pb-4 pt-0 space-y-4 border-t border-border/30 bg-surface-2/10">
          <div className="pt-3">
            <AnalysisChartPanelControlled
              symbol={item.pair}
              testnet={testnet}
              defaultInterval={ctx.trendTf}
              indicators={chartIndicators}
              onIndicatorsChange={setChartIndicators}
              showIntervalPicker
            />
          </div>

          <AnalysisMetricsGrid indicators={item.indicators} ctx={metricsCtx} />

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="text-[10px] mono uppercase tracking-widest text-primary mb-1">Raționament AI</div>
            <div className="text-xs text-text-primary">{item.reasoning || "—"}</div>
            {item.keyFactors && item.keyFactors.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.keyFactors.map((f, i) => (
                  <span key={i} className="chip border-border text-text-muted text-[10px]">
                    {f}
                  </span>
                ))}
              </div>
            )}
            {(item.aiProvider || item.riskLevel) && (
              <div className="text-[10px] mono text-text-muted mt-2">
                {item.aiProvider}
                {item.aiModel ? ` / ${item.aiModel}` : ""}
                {item.riskLevel ? ` · risc ${item.riskLevel}` : ""}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
