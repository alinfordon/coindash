"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { classOfPnl, fmtDuration, fmtPct, fmtUsd, fmtNum } from "@/lib/utils";
import { toast } from "sonner";
import { X, Wand2, Undo2 } from "lucide-react";
import { SWR_OPEN_TRADES } from "@/lib/swrDefaults";

export function OpenPositionsTable() {
  const { data, mutate } = useSWR<{ trades: any[] }>("/api/trades/open", undefined, SWR_OPEN_TRADES);
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

  async function restoreReconciled() {
    toast.loading("Restoring reconciled positions…", { id: "restore" });
    try {
      const r = await fetch("/api/positions/restore-reconciled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutesBack: 1440 }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed");
      if (j.restoredCount > 0) {
        toast.success(
          `Restored ${j.restoredCount} position${j.restoredCount > 1 ? "s" : ""}: ${j.restored.map((c: any) => c.pair).join(", ")}`,
          { id: "restore", duration: 8000 }
        );
      } else {
        toast.success("Nothing to restore", { id: "restore" });
      }
      mutate();
    } catch (e: any) {
      toast.error(`Restore failed: ${e.message}`, { id: "restore" });
    }
  }

  async function reconcile() {
    toast.loading("Reconciling positions…", { id: "reconcile" });
    try {
      const r = await fetch("/api/positions/reconcile", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Failed");
      if (j.closedCount > 0) {
        const parts = (j.closed || []) as { pair: string; closedReason?: string }[];
        const tp = parts.filter((c) => c.closedReason === "TP_HIT").length;
        const sl = parts.filter((c) => c.closedReason === "SL_HIT").length;
        const other = j.closedCount - tp - sl;
        const detail =
          tp || sl
            ? ` · ${tp ? `${tp} TP` : ""}${tp && sl ? ", " : ""}${sl ? `${sl} SL` : ""}${other ? `, ${other} sync` : ""}`
            : "";
        toast.success(
          `Synced ${j.closedCount} closed on exchange${detail}: ${parts.map((c) => c.pair).join(", ")}`,
          { id: "reconcile", duration: 8000 }
        );
      } else {
        toast.success(`Nothing to reconcile (${j.keptCount} active)`, { id: "reconcile" });
      }
      mutate();
    } catch (e: any) {
      toast.error(`Reconcile failed: ${e.message}`, { id: "reconcile" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Positions</CardTitle>
        <div className="flex items-center gap-3">
          <div className="text-[10px] mono uppercase tracking-widest text-text-muted">
            {trades.length} OPEN · MARK-TO-MARKET
          </div>
          <button
            className="btn py-1 px-2 text-[11px]"
            onClick={restoreReconciled}
            title="Restore positions wrongly closed by the reconciler in the last 24h"
          >
            <Undo2 className="h-3 w-3" /> Restore
          </button>
          <button className="btn py-1 px-2 text-[11px]" onClick={reconcile} title="Sync DB with Binance — OCO fills become TP/SL, not RECONCILED">
            <Wand2 className="h-3 w-3" /> Reconcile
          </button>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-text-muted border-b border-border/70">
            <tr>
              <th className="text-left py-2 px-2">Pair</th>
              <th className="text-right py-2 px-2">Entry</th>
              <th className="text-right py-2 px-2">Current</th>
              <th className="text-right py-2 px-2">Invested</th>
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
                <td colSpan={11} className="py-6 text-center text-text-muted">
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
                <td className="text-right mono py-2 px-2 text-text-primary">
                  {fmtUsd(t.usdcValue ?? (t.entryPrice ?? 0) * (t.quantity ?? 0))}
                </td>
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
