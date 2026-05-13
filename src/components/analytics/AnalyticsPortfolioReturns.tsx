"use client";

import type { AnalyticsMetrics } from "@/lib/analytics";
import { Stat } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactNode } from "react";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";

function Tip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex cursor-help border-none bg-transparent p-0 w-full">
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="leading-snug max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function AnalyticsPortfolioReturns({ m }: { m: AnalyticsMetrics }) {
  const hint =
    "PnL realizat în perioada calendaristică împărțit la valoarea totală curentă a portofoliului Binance (free+locked, prețuri USDC). Nu este time-weighted și nu folosește NAV la început de lună — compară profitul perioadei cu mărimea actuală a contului.";
  const navMissing = !Number.isFinite(m.portfolioDenominatorUsd) || m.portfolioDenominatorUsd <= 0;

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-xs uppercase tracking-[0.28em] text-text-muted">Randament vs portofoliu</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] mono text-text-primary">{fmtUsd(m.portfolioDenominatorUsd)} NAV</span>
          {m.portfolioDenominatorSource === "live" ? (
            <Badge variant="success">Live Binance</Badge>
          ) : (
            <Badge variant="warning">Snapshot</Badge>
          )}
          {m.portfolioSnapshotUpdatedAt && (
            <span className="text-[10px] mono text-text-muted">
              sync {new Date(m.portfolioSnapshotUpdatedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>
      {navMissing && (
        <p className="mb-3 text-[11px] text-amber-300/90 mono">
          Valoare portofoliu indisponibilă sau snapshot 0 — verifică API Binance în setări sau apasă Sync pe dashboard.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Tip text={`${hint} Săptămână curentă (ISO).`}>
          <Stat
            label="Săpt. vs portofoliu"
            value={
              <span className={classOfPnl(m.weeklyPortfolioReturnPct)}>{fmtPct(m.weeklyPortfolioReturnPct)}</span>
            }
            sub={
              <span className="mono text-text-muted">
                P&L {fmtUsd(m.weeklyPeriodPnlUsd)} / {fmtUsd(m.portfolioDenominatorUsd)}
              </span>
            }
            accent={m.weeklyPortfolioReturnPct >= 0 ? "success" : "danger"}
          />
        </Tip>
        <Tip text={`${hint} Luna curentă în TZ filtre.`}>
          <Stat
            label="Lună vs portofoliu"
            value={
              <span className={classOfPnl(m.monthlyPortfolioReturnPct)}>{fmtPct(m.monthlyPortfolioReturnPct)}</span>
            }
            sub={
              <span className="mono text-text-muted">
                P&L {fmtUsd(m.monthlyPeriodPnlUsd)} / {fmtUsd(m.portfolioDenominatorUsd)}
              </span>
            }
            accent={m.monthlyPortfolioReturnPct >= 0 ? "success" : "danger"}
          />
        </Tip>
        <Tip text={`${hint} An calendaristic (YTD).`}>
          <Stat
            label="An vs portofoliu"
            value={<span className={classOfPnl(m.yearlyPortfolioReturnPct)}>{fmtPct(m.yearlyPortfolioReturnPct)}</span>}
            sub={
              <span className="mono text-text-muted">
                P&L {fmtUsd(m.yearlyPeriodPnlUsd)} / {fmtUsd(m.portfolioDenominatorUsd)}
              </span>
            }
            accent={m.yearlyPortfolioReturnPct >= 0 ? "success" : "danger"}
          />
        </Tip>
      </div>
    </div>
  );
}
