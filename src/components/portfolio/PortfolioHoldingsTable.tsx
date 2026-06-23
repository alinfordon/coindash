"use client";

import { cn, fmtPct, fmtUsd } from "@/lib/utils";
import type { PortfolioHolding } from "@/lib/investPortfolioTypes";
import { filterPortfolioHoldings } from "@/lib/investPortfolioTypes";

function driftColor(drift: number) {
  if (Math.abs(drift) < 2) return "text-success";
  if (Math.abs(drift) < 5) return "text-warning";
  return "text-danger";
}

export function PortfolioHoldingsTable({
  holdings,
  dustHiddenCount = 0,
}: {
  holdings: PortfolioHolding[];
  dustHiddenCount?: number;
}) {
  const rows = filterPortfolioHoldings(holdings);
  if (!rows.length) {
    return <p className="text-sm text-text-muted">Nicio deținere — configurează țintele și sincronizează Binance.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] mono uppercase tracking-widest text-text-muted border-b border-border">
            <th className="py-2 pr-3">Activ</th>
            <th className="py-2 pr-3 text-right">Valoare</th>
            <th className="py-2 pr-3 text-right">Actual</th>
            <th className="py-2 pr-3 text-right">Țintă</th>
            <th className="py-2 pr-3 text-right">Drift</th>
            <th className="py-2 text-right">Alocare</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.asset} className="border-b border-border/40">
              <td className="py-2.5 pr-3">
                <div className="font-medium mono">{h.asset}</div>
                {h.inTradingQty > 0 && (
                  <div className="text-[10px] text-warning">trading: {h.inTradingQty.toFixed(4)}</div>
                )}
              </td>
              <td className="py-2.5 pr-3 text-right mono tabular-nums">{fmtUsd(h.valueUsdc)}</td>
              <td className="py-2.5 pr-3 text-right mono tabular-nums">{h.currentWeightPct.toFixed(1)}%</td>
              <td className="py-2.5 pr-3 text-right mono tabular-nums text-text-muted">
                {h.targetWeightPct > 0 ? `${h.targetWeightPct.toFixed(1)}%` : "—"}
              </td>
              <td className={cn("py-2.5 pr-3 text-right mono tabular-nums font-medium", driftColor(h.driftPct))}>
                {h.targetWeightPct > 0 ? fmtPct(h.driftPct) : "—"}
              </td>
              <td className="py-2.5 text-right">
                <AllocationBar current={h.currentWeightPct} target={h.targetWeightPct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {dustHiddenCount > 0 && (
        <p className="text-[10px] text-text-muted mt-2">
          {dustHiddenCount} {dustHiddenCount === 1 ? "activ ascuns" : "active ascunse"} (sub $1, fără țintă de alocare)
        </p>
      )}
    </div>
  );
}

function AllocationBar({ current, target }: { current: number; target: number }) {
  const max = Math.max(current, target, 1);
  const curW = (current / max) * 100;
  const tgtW = target > 0 ? (target / max) * 100 : 0;
  return (
    <div className="inline-flex flex-col gap-0.5 w-24 ml-auto">
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-primary/80 rounded-full" style={{ width: `${Math.min(100, curW)}%` }} />
      </div>
      {target > 0 && (
        <div className="h-0.5 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full bg-secondary/70 rounded-full" style={{ width: `${Math.min(100, tgtW)}%` }} />
        </div>
      )}
    </div>
  );
}
