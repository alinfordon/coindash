"use client";

import type { AnalyticsMetrics } from "@/lib/analytics";
import { Stat } from "@/components/ui/Card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReactNode } from "react";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";
import { CalendarRange } from "lucide-react";

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

export function AnalyticsPeriodReturns({ m, timeZone }: { m: AnalyticsMetrics; timeZone: string }) {
  const tzLabel = timeZone || "UTC";
  const hint =
    "Procent = PnL realizat în perioadă / bază USDC (equity cumulat, notional max, sau planșa din setări).";

  const items = [
    {
      key: "w",
      label: "Săptămână",
      value: <span className={classOfPnl(m.weeklyReturnPct)}>{fmtPct(m.weeklyReturnPct)}</span>,
      sub: (
        <span className="mono">
          P&L {fmtUsd(m.weeklyPeriodPnlUsd)} · bază {fmtUsd(m.weeklyReturnBasisUsd)}
        </span>
      ),
      accent: (m.weeklyReturnPct >= 0 ? "success" : "danger") as const,
      tip: `${hint} Săptămâna curentă (luni → duminică).`,
    },
    {
      key: "m",
      label: "Lună",
      value: <span className={classOfPnl(m.monthlyReturnPct)}>{fmtPct(m.monthlyReturnPct)}</span>,
      sub: (
        <span className="mono">
          P&L {fmtUsd(m.monthlyPeriodPnlUsd)} · bază {fmtUsd(m.monthlyReturnBasisUsd)}
        </span>
      ),
      accent: (m.monthlyReturnPct >= 0 ? "success" : "danger") as const,
      tip: `${hint} Luna calendaristică curentă.`,
    },
    {
      key: "y",
      label: "An",
      value: <span className={classOfPnl(m.yearlyReturnPct)}>{fmtPct(m.yearlyReturnPct)}</span>,
      sub: (
        <span className="mono">
          P&L {fmtUsd(m.yearlyPeriodPnlUsd)} · bază {fmtUsd(m.yearlyReturnBasisUsd)}
        </span>
      ),
      accent: (m.yearlyReturnPct >= 0 ? "success" : "danger") as const,
      tip: `${hint} Anul calendaristic curent.`,
    },
  ];

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-secondary shrink-0" />
          <h2 className="font-heading text-xs uppercase tracking-[0.28em] text-text-muted">Randament calendaristic</h2>
        </div>
        <span className="text-[10px] mono text-text-muted px-2 py-0.5 rounded-md border border-border/50">{tzLabel}</span>
      </div>
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
