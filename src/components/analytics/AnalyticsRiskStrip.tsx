"use client";

import type { AnalyticsMetrics } from "@/lib/analytics";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { fmtUsd } from "@/lib/utils";

export function AnalyticsRiskStrip({ m }: { m: AnalyticsMetrics }) {
  const rf = m.recoveryFactor >= 998 ? "∞" : m.recoveryFactor.toFixed(2);
  return (
    <Card className="mb-8 py-4">
      <CardHeader className="mb-0">
        <CardTitle>Risk & Execution Ratios</CardTitle>
        <span className="text-[10px] mono text-text-muted uppercase tracking-widest">closed-trade statistics</span>
      </CardHeader>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 px-5 pb-5 pt-2">
        <Mini label="Sharpe (252)" value={m.sharpeRatio.toFixed(2)} hint="bucket returns" />
        <Mini label="Expectancy / trade" value={fmtUsd(m.expectancy)} hint="probability-weighted mean" />
        <Mini label="Recovery factor" value={rf} hint="net / max DD USD" />
        <Mini label="Avg hold" value={fmtHold(m.averageHoldingMinutes)} hint="opened → closed" />
        <Mini label="Max win streak" value={String(m.longestWinningStreak)} hint="closed trades" />
        <Mini label="Max loss streak" value={String(m.longestLosingStreak)} hint="closed trades" />
        <Mini label="Gross profit" value={fmtUsd(m.grossProfit)} hint="sum of winners" />
      </div>
    </Card>
  );
}

function fmtHold(min: number) {
  if (!min || !Number.isFinite(min)) return "—";
  if (min >= 1440) return `${(min / 1440).toFixed(1)} d`;
  if (min >= 60) return `${(min / 60).toFixed(1)} h`;
  return `${Math.round(min)} m`;
}

function Mini({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-surface-2/40 px-3 py-2 transition hover:border-primary/35 hover:bg-primary/[0.03]">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-heading">{label}</div>
      <div className="mt-1 mono text-sm font-semibold text-text-primary">{value}</div>
      <div className="mt-0.5 text-[10px] text-text-muted">{hint}</div>
    </div>
  );
}
