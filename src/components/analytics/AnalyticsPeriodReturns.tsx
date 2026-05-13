"use client";

import type { AnalyticsMetrics } from "@/lib/analytics";
import { Stat } from "@/components/ui/Card";
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

export function AnalyticsPeriodReturns({ m, timeZone }: { m: AnalyticsMetrics; timeZone: string }) {
  const tzLabel = timeZone || "UTC";
  const hint =
    "Procent = PnL realizat în perioadă împărțit la o bază în USDC: maximul dintre |equity realizat cumulat înainte de perioadă|, cel mai mare notional al unei poziții închise în perioadă (usdcValue sau entry×qty), și planșa din setări (≥10 și maxUsdcPerOrder). Nu este randament la întreg portofoliul Binance — evită artefact de sute la sută când istoricul cumulat înainte de lună era aproape zero.";
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-heading text-xs uppercase tracking-[0.28em] text-text-muted">Randament calendaristic</h2>
        <span className="text-[10px] mono text-text-muted">{tzLabel}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Tip text={`${hint} Săptămâna curentă (luni → duminică, ora 00:00 în TZ).`}>
          <Stat
            label="Randament săptămână"
            value={<span className={classOfPnl(m.weeklyReturnPct)}>{fmtPct(m.weeklyReturnPct)}</span>}
            sub={
              <span className="mono text-text-muted">
                P&L {fmtUsd(m.weeklyPeriodPnlUsd)} · bază ~{fmtUsd(m.weeklyReturnBasisUsd)}
              </span>
            }
            accent={m.weeklyReturnPct >= 0 ? "success" : "danger"}
          />
        </Tip>
        <Tip text={`${hint} Luna calendaristică curentă în TZ.`}>
          <Stat
            label="Randament lună"
            value={<span className={classOfPnl(m.monthlyReturnPct)}>{fmtPct(m.monthlyReturnPct)}</span>}
            sub={
              <span className="mono text-text-muted">
                P&L {fmtUsd(m.monthlyPeriodPnlUsd)} · bază ~{fmtUsd(m.monthlyReturnBasisUsd)}
              </span>
            }
            accent={m.monthlyReturnPct >= 0 ? "success" : "danger"}
          />
        </Tip>
        <Tip text={`${hint} Anul calendaristic curent în TZ.`}>
          <Stat
            label="Randament an"
            value={<span className={classOfPnl(m.yearlyReturnPct)}>{fmtPct(m.yearlyReturnPct)}</span>}
            sub={
              <span className="mono text-text-muted">
                P&L {fmtUsd(m.yearlyPeriodPnlUsd)} · bază ~{fmtUsd(m.yearlyReturnBasisUsd)}
              </span>
            }
            accent={m.yearlyReturnPct >= 0 ? "success" : "danger"}
          />
        </Tip>
      </div>
    </div>
  );
}
