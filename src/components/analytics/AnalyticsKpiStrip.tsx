"use client";

import type { AnalyticsMetrics } from "@/lib/analytics";
import type { ReactNode } from "react";
import { Stat } from "@/components/ui/Card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";

function Tip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex cursor-help border-none bg-transparent p-0">
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="leading-snug">
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

export function AnalyticsKpiStrip({ m }: { m: AnalyticsMetrics }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-8">
      <Tip text="Sum of realized P&L after fees over filtered CLOSED trades.">
        <Stat
          label="Net PnL"
          value={<span className={classOfPnl(m.totalNetPnL)}>{fmtUsd(m.totalNetPnL)}</span>}
          sub={<span className="mono text-text-muted">{m.tradeCount} trades</span>}
          accent={m.totalNetPnL >= 0 ? "success" : "danger"}
        />
      </Tip>
      <Tip text="Share of CLOSED trades with positive realized P&L.">
        <Stat
          label="Win Rate"
          value={<span className="mono">{(m.winRate * 100).toFixed(1)}%</span>}
          sub={<span className="mono text-text-muted">closed outcomes</span>}
          accent="secondary"
        />
      </Tip>
      <Tip text="Gross profit divided by absolute gross loss on CLOSED trades.">
        <Stat
          label="Profit Factor"
          value={<span className="mono text-success">{fmtPf(m.profitFactor)}</span>}
          sub={<span className="mono text-text-muted">gross profit / |gross loss|</span>}
          accent="success"
        />
      </Tip>
      <Tip text="Maximum peak-to-trough decline on the cumulative equity curve built from CLOSED trades (percentage vs trailing peak).">
        <Stat
          label="Max Drawdown"
          value={<span className="mono text-loss">{fmtDd(m.maxDrawdownPct)}</span>}
          sub={<span className="mono text-text-muted">{fmtUsd(-m.maxDrawdownUsd)} trough</span>}
          accent="danger"
        />
      </Tip>
      <Tip text="Drawdown versus the latest equity peak using only CLOSED-trade cumulative equity.">
        <Stat
          label="Current DD"
          value={<span className={classOfPnl(-m.currentDrawdownUsd)}>{fmtDd(m.currentDrawdownPct)}</span>}
          sub={<span className="mono text-text-muted">{fmtUsd(-m.currentDrawdownUsd)} off peak</span>}
          accent={m.currentDrawdownPct > 15 ? "danger" : "secondary"}
        />
      </Tip>
      <Tip text="Mean P&L percent per CLOSED trade (DB field pnlPercent).">
        <Stat
          label="Avg Trade Return"
          value={<span className={classOfPnl(m.avgTradeReturnPct)}>{fmtPct(m.avgTradeReturnPct)}</span>}
          sub={<span className="mono text-text-muted">mean of trade %</span>}
          accent={m.avgTradeReturnPct >= 0 ? "success" : "danger"}
        />
      </Tip>
      <Tip text="Sum of recorded fees on CLOSED trades (fee field when present). Percent compares fees to gross absolute P&L movement.">
        <Stat
          label="Total Fees"
          value={<span className="mono">{fmtUsd(m.totalFees)}</span>}
          sub={<span className="mono text-text-muted">{m.feesPercentage.toFixed(1)}% vs gross Σ|P&L|</span>}
          accent="secondary"
        />
      </Tip>
    </div>
  );
}
