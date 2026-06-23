"use client";

import type { ReactNode } from "react";
import type { AnalysisDisplayContext, AnalysisIndicatorsData } from "@/lib/analysisDisplayTypes";
import { classOfPnl, cn, fmtNum, fmtPct } from "@/lib/utils";

function Metric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/30 px-2.5 py-2 min-w-0">
      <div className="text-[10px] mono text-text-muted truncate">{label}</div>
      <div className={cn("mono text-sm truncate", valueClass)}>{value}</div>
    </div>
  );
}

function FibBlock({
  label,
  fib,
}: {
  label: string;
  fib: AnalysisIndicatorsData["fibonacci"];
}) {
  if (!fib) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/30 p-2.5 col-span-full">
      <div className="text-[10px] mono text-text-muted mb-1">{label}</div>
      <div className="text-xs mono space-y-0.5">
        <div>
          Swing {fib.swingDirection ?? "—"} · H {fmtNum(fib.swingHigh, 4)} / L {fmtNum(fib.swingLow, 4)}
        </div>
        <div>
          Nivel apropiat {fib.nearestLevel ?? "—"} · retracement ~{fmtNum(fib.retracementPct, 1)}%
        </div>
        {fib.levels && (
          <div className="text-[10px] text-text-muted">
            38.2% {fmtNum(fib.levels["0.382"], 4)} · 50% {fmtNum(fib.levels["0.5"], 4)} · 61.8%{" "}
            {fmtNum(fib.levels["0.618"], 4)}
          </div>
        )}
      </div>
    </div>
  );
}

function ElliottBlock({
  label,
  ew,
}: {
  label: string;
  ew: AnalysisIndicatorsData["elliottWave"];
}) {
  if (!ew) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/30 p-2.5 col-span-full">
      <div className="text-[10px] mono text-text-muted mb-1">{label}</div>
      <div className="text-xs mono">
        {ew.phase ?? "—"} · {ew.waveLegs ?? 0} valuri · pivot {ew.pivotCount ?? 0}
      </div>
      {ew.summary && <div className="text-[10px] text-text-muted mt-1">{ew.summary}</div>}
    </div>
  );
}

type Props = {
  indicators?: AnalysisIndicatorsData;
  ctx: Pick<AnalysisDisplayContext, "trendTf" | "entryTf" | "visible">;
  className?: string;
};

export function AnalysisMetricsGrid({ indicators: ind = {}, ctx, className }: Props) {
  const entryRsi = ind.entryRsi ?? ind.rsi15m;
  const entryMacd = ind.entryMacdHist ?? ind.macdHist15m;
  const entryTrend = ind.entryTrend5 ?? ind.trend15m;
  const cells: ReactNode[] = [];

  if (ctx.visible.rsi) {
    cells.push(
      <Metric key="rsi-t" label={`RSI ${ctx.trendTf}`} value={fmtNum(ind.rsi, 2)} />,
      <Metric key="rsi-e" label={`RSI ${ctx.entryTf}`} value={fmtNum(entryRsi, 2)} />
    );
  }
  if (ctx.visible.macd) {
    cells.push(
      <Metric
        key="macd-t"
        label={`MACD ${ctx.trendTf}`}
        value={fmtNum(ind.macd?.histogram, 4)}
        valueClass={classOfPnl(ind.macd?.histogram ?? 0)}
      />,
      <Metric
        key="macd-e"
        label={`MACD ${ctx.entryTf}`}
        value={fmtNum(entryMacd, 4)}
        valueClass={classOfPnl(entryMacd ?? 0)}
      />
    );
  }
  if (ctx.visible.ema) {
    cells.push(
      <Metric
        key="ema"
        label={`EMA 20/50 ${ctx.trendTf}`}
        value={`${fmtNum(ind.ema20, 4)} / ${fmtNum(ind.ema50, 4)}`}
      />
    );
  }
  if (ctx.visible.bollinger && ind.bb) {
    cells.push(
      <Metric
        key="bb"
        label={`BB ${ctx.trendTf}`}
        value={`${fmtNum(ind.bb.lower, 2)} … ${fmtNum(ind.bb.upper, 2)}`}
      />
    );
  }
  if (ctx.visible.fibonacci) {
    cells.push(
      <FibBlock key="fib-t" label={`Fibonacci ${ctx.trendTf}`} fib={ind.fibonacci} />,
      <FibBlock key="fib-e" label={`Fibonacci ${ctx.entryTf}`} fib={ind.fibonacciEntry} />
    );
  }
  if (ctx.visible.elliottWave) {
    cells.push(
      <ElliottBlock key="ew-t" label={`Elliott ${ctx.trendTf}`} ew={ind.elliottWave} />,
      <ElliottBlock key="ew-e" label={`Elliott ${ctx.entryTf}`} ew={ind.elliottWaveEntry} />
    );
  }

  cells.push(
    <Metric
      key="24h"
      label="24h Δ"
      value={fmtPct(ind.priceChange24h ?? 0)}
      valueClass={classOfPnl(ind.priceChange24h ?? 0)}
    />
  );
  if (entryTrend) {
    cells.push(<Metric key="trend-e" label={`Trend 5× ${ctx.entryTf}`} value={entryTrend} />);
  }

  if (!cells.length) return null;

  return <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-2", className)}>{cells}</div>;
}
