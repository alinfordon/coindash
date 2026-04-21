"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { classOfPnl, fmtDuration, fmtPct, fmtUsd, fmtNum } from "@/lib/utils";
import { toast } from "sonner";
import { X } from "lucide-react";

export function OpenPositionsTable() {
  const { data, mutate } = useSWR<{ trades: any[] }>("/api/trades/open");
  const trades = data?.trades || [];

  async function closeOne(id: string, pair: string) {
    toast.loading(`Closing ${pair}…`, { id });
    try {
      const r = await fetch(`/api/trades/close/${id}`, { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed");
      toast.success(`Closed ${pair} · PnL ${j.trade?.pnlPercent?.toFixed(2)}%`, { id });
      mutate();
    } catch (e: any) {
      toast.error(`Close failed: ${e.message}`, { id });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Positions</CardTitle>
        <div className="text-[10px] mono uppercase tracking-widest text-text-muted">
          {trades.length} OPEN · MARK-TO-MARKET
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-text-muted border-b border-border/70">
            <tr>
              <th className="text-left py-2 px-2">Pair</th>
              <th className="text-right py-2 px-2">Entry</th>
              <th className="text-right py-2 px-2">Current</th>
              <th className="text-right py-2 px-2">P&L %</th>
              <th className="text-right py-2 px-2">P&L USDC</th>
              <th className="text-right py-2 px-2">Duration</th>
              <th className="text-right py-2 px-2">SL</th>
              <th className="text-right py-2 px-2">TP</th>
              <th className="text-right py-2 px-2">Status</th>
              <th className="text-right py-2 px-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-text-muted">
                  No open positions. Enable AI Pilot or wait for next analysis cycle.
                </td>
              </tr>
            )}
            {trades.map((t: any) => (
              <tr key={t._id} className="border-b border-border/30 hover:bg-surface-2/30 transition">
                <td className="py-2.5 px-2 mono font-semibold text-text-primary">
                  {t.pair}
                  {t.dryRun && <span className="ml-2 chip border-warning/40 text-warning">DRY</span>}
                </td>
                <td className="text-right mono py-2 px-2">{fmtNum(t.entryPrice, 4)}</td>
                <td className="text-right mono py-2 px-2">{fmtNum(t.currentPrice, 4)}</td>
                <td className={`text-right mono py-2 px-2 font-semibold ${classOfPnl(t.pnlPercent)}`}>
                  {fmtPct(t.pnlPercent)}
                </td>
                <td className={`text-right mono py-2 px-2 ${classOfPnl(t.pnlUsdc)}`}>{fmtUsd(t.pnlUsdc)}</td>
                <td className="text-right mono text-text-muted py-2 px-2">{fmtDuration(t.durationMs)}</td>
                <td className="text-right mono text-danger py-2 px-2">{fmtNum(t.stopLoss, 4)}</td>
                <td className="text-right mono text-success py-2 px-2">{fmtNum(t.takeProfit, 4)}</td>
                <td className="text-right py-2 px-2">
                  <span className="chip border-primary/40 text-primary">
                    <span className="pulse-dot" /> {t.status}
                  </span>
                </td>
                <td className="text-right py-2 px-2">
                  <button
                    className="btn-danger py-1 px-2 text-[11px]"
                    onClick={() => closeOne(t._id, t.pair)}
                  >
                    <X className="h-3 w-3" /> Close
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
