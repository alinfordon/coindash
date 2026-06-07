"use client";

import type { AnalyticsMetrics } from "@/lib/analytics";
import { Stat } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactNode } from "react";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";
import { Wallet } from "lucide-react";

function Tip({ children, text }: { children: ReactNode; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex w-full h-full cursor-help border-none bg-transparent p-0 text-left">
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
  const hint = "PnL perioadă / valoarea totală curentă a portofoliului Binance (USDC).";
  const navMissing = !Number.isFinite(m.portfolioDenominatorUsd) || m.portfolioDenominatorUsd <= 0;

  const items = [
    {
      key: "w",
      label: "Săpt. vs NAV",
      value: <span className={classOfPnl(m.weeklyPortfolioReturnPct)}>{fmtPct(m.weeklyPortfolioReturnPct)}</span>,
      sub: (
        <span className="mono">
          {fmtUsd(m.weeklyPeriodPnlUsd)} / {fmtUsd(m.portfolioDenominatorUsd)}
        </span>
      ),
      accent: (m.weeklyPortfolioReturnPct >= 0 ? "success" : "danger") as const,
      tip: `${hint} Săptămână curentă.`,
    },
    {
      key: "m",
      label: "Lună vs NAV",
      value: <span className={classOfPnl(m.monthlyPortfolioReturnPct)}>{fmtPct(m.monthlyPortfolioReturnPct)}</span>,
      sub: (
        <span className="mono">
          {fmtUsd(m.monthlyPeriodPnlUsd)} / {fmtUsd(m.portfolioDenominatorUsd)}
        </span>
      ),
      accent: (m.monthlyPortfolioReturnPct >= 0 ? "success" : "danger") as const,
      tip: `${hint} Luna curentă.`,
    },
    {
      key: "y",
      label: "An vs NAV",
      value: <span className={classOfPnl(m.yearlyPortfolioReturnPct)}>{fmtPct(m.yearlyPortfolioReturnPct)}</span>,
      sub: (
        <span className="mono">
          {fmtUsd(m.yearlyPeriodPnlUsd)} / {fmtUsd(m.portfolioDenominatorUsd)}
        </span>
      ),
      accent: (m.yearlyPortfolioReturnPct >= 0 ? "success" : "danger") as const,
      tip: `${hint} YTD.`,
    },
  ];

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary shrink-0" />
          <h2 className="font-heading text-xs uppercase tracking-[0.28em] text-text-muted">Randament vs portofoliu</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] mono text-text-primary font-semibold">{fmtUsd(m.portfolioDenominatorUsd)} NAV</span>
          {m.portfolioDenominatorSource === "live" ? (
            <Badge variant="success">Live</Badge>
          ) : (
            <Badge variant="warning">Snapshot</Badge>
          )}
        </div>
      </div>
      {navMissing && (
        <p className="mb-3 text-[11px] text-amber-300/90 mono px-1">
          NAV indisponibil — verifică API Binance sau Sync pe dashboard.
        </p>
      )}
      <div className="glass rounded-2xl border border-border/70 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/50">
          {items.map((item) => (
            <Tip key={item.key} text={item.tip}>
              <Stat variant="embedded" label={item.label} value={item.value} sub={item.sub} accent={item.accent} />
            </Tip>
          ))}
        </div>
      </div>
    </section>
  );
}
