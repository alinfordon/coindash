"use client";

import type { AnalyticsMetrics } from "@/lib/analytics";
import type { ReactNode } from "react";
import { Stat } from "@/components/ui/Card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

function Tip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex w-full h-full cursor-help border-none bg-transparent p-0 text-left"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="leading-snug max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function fmtPf(n: number) {
  if (n >= 998) return "∞";
  return n.toFixed(2);
}

function fmtDd(n: number) {
  return `${n.toFixed(2)}%`;
}

const KPI_ITEMS = (m: AnalyticsMetrics) =>
  [
    {
      key: "net",
      tip: "Sum of realized P&L after fees over filtered CLOSED trades.",
      label: "Net PnL",
      value: <span className={classOfPnl(m.totalNetPnL)}>{fmtUsd(m.totalNetPnL)}</span>,
      sub: <span className="mono">{m.tradeCount} trades</span>,
      accent: m.totalNetPnL >= 0 ? ("success" as const) : ("danger" as const),
    },
    {
      key: "wr",
      tip: "Share of CLOSED trades with positive realized P&L.",
      label: "Win Rate",
      value: <span>{(m.winRate * 100).toFixed(1)}%</span>,
      sub: <span className="mono">closed outcomes</span>,
      accent: "secondary" as const,
    },
    {
      key: "pf",
      tip: "Gross profit divided by absolute gross loss on CLOSED trades.",
      label: "Profit Factor",
      value: <span className="text-success">{fmtPf(m.profitFactor)}</span>,
      sub: <span className="mono">profit / |loss|</span>,
      accent: "success" as const,
    },
    {
      key: "mdd",
      tip: "Cea mai mare scădere peak→trough pe PnL realizat cumulat. Procentul vs NAV portofoliu.",
      label: "Max Drawdown",
      value: <span className="text-loss">{fmtDd(m.maxDrawdownPct)}</span>,
      sub: (
        <span className="mono">
          {fmtUsd(-m.maxDrawdownUsd)} · NAV {fmtUsd(m.portfolioDenominatorUsd)}
        </span>
      ),
      accent: "danger" as const,
    },
    {
      key: "cdd",
      tip: "Drawdown curent față de ultimul vârf al PnL realizat.",
      label: "Current DD",
      value: <span className={classOfPnl(-m.currentDrawdownUsd)}>{fmtDd(m.currentDrawdownPct)}</span>,
      sub: <span className="mono">{fmtUsd(-m.currentDrawdownUsd)} off peak</span>,
      accent: (m.currentDrawdownPct > 15 ? "danger" : "secondary") as const,
    },
    {
      key: "avg",
      tip: "Mean P&L percent per CLOSED trade.",
      label: "Avg Return",
      value: <span className={classOfPnl(m.avgTradeReturnPct)}>{fmtPct(m.avgTradeReturnPct)}</span>,
      sub: <span className="mono">per trade %</span>,
      accent: (m.avgTradeReturnPct >= 0 ? "success" : "danger") as const,
    },
    {
      key: "fees",
      tip: "Sum of fees on CLOSED trades vs gross |P&L| movement.",
      label: "Total Fees",
      value: <span>{fmtUsd(m.totalFees)}</span>,
      sub: <span className="mono">{m.feesPercentage.toFixed(1)}% of gross</span>,
      accent: "secondary" as const,
    },
  ] as const;

export function AnalyticsKpiStrip({ m }: { m: AnalyticsMetrics }) {
  const items = KPI_ITEMS(m);

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary shrink-0" />
        <h2 className="font-heading text-xs uppercase tracking-[0.28em] text-text-muted">Core metrics</h2>
      </div>

      <div className="glass rounded-2xl border border-border/70 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 divide-x divide-y divide-border/50">
          {items.map((item) => (
            <Tip key={item.key} text={item.tip}>
              <Stat
                variant="embedded"
                label={item.label}
                value={item.value}
                sub={item.sub}
                accent={item.accent}
              />
            </Tip>
          ))}
        </div>
      </div>
    </section>
  );
}
