"use client";

import useSWR from "swr";
import { Stat } from "@/components/ui/Card";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";
import { OpenPositionsTable } from "@/components/dashboard/OpenPositionsTable";
import { PnlChart } from "@/components/dashboard/PnlChart";
import { TradesChart } from "@/components/dashboard/TradesChart";
import { HourlyBars } from "@/components/dashboard/HourlyBars";
import { DailyHeatmap } from "@/components/dashboard/DailyHeatmap";
import { AIDecisionLog } from "@/components/dashboard/AIDecisionLog";
import { TopPairs } from "@/components/dashboard/TopPairs";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { Zap, Pause, ShieldCheck, Activity, Target, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SWR_DASHBOARD_PAGE } from "@/lib/swrDefaults";

export default function DashboardPage() {
  const { data: stats, mutate } = useSWR<any>("/api/dashboard/stats", undefined, SWR_DASHBOARD_PAGE);

  async function trigger(path: string, label: string) {
    toast.loading(label, { id: path });
    try {
      const r = await fetch(path, { method: "POST" });
      const j = await r.json();
      if (path.includes("analysis")) {
        if (j.error) {
          toast.error(j.error, { id: path, duration: 12000 });
        } else {
          const summary = j.reason || `Analyzed ${j.analyzed ?? 0}/${j.pairsQueued ?? "?"}, opened ${j.opened ?? 0}`;
          if ((j.opened ?? 0) > 0) toast.success(summary, { id: path, duration: 8000 });
          else toast.warning?.(summary, { id: path, duration: 14000 }) ?? toast(summary, { id: path, duration: 14000 });
        }
      } else {
        toast.success(`Checked ${j.checked ?? 0}, closed ${j.closed ?? 0}`, { id: path });
      }
      mutate();
    } catch (e: any) {
      toast.error(e.message, { id: path });
    }
  }

  const pilot = stats?.pilotActive;
  const pnlToday = stats?.pnlTodayUsdc ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">Command Center</h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1 mono tracking-wider">AUTONOMOUS · AI-PILOTED · REAL-TIME</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn flex-1 sm:flex-none justify-center"
            onClick={async () => {
              toast.loading("Syncing balance…", { id: "sync-balance" });
              try {
                const r = await fetch("/api/balance/sync", { method: "POST" });
                const j = await r.json();
                if (j.ok) {
                  const unpriced = (j.unpriced || []) as { asset: string; qty: number }[];
                  if (unpriced.length > 0) {
                    toast.warning(
                      `Balance: $${(+j.total).toFixed(2)} · ${unpriced.length} unpriced: ${unpriced.map((u) => u.asset).join(", ")}`,
                      { id: "sync-balance", duration: 10000 }
                    );
                    console.warn("[balance-sync] unpriced assets:", unpriced);
                    console.info("[balance-sync] full breakdown:", j.breakdown);
                  } else {
                    toast.success(`Balance: $${(+j.total).toFixed(2)}`, { id: "sync-balance" });
                  }
                } else {
                  toast.error(j.error || "sync failed", { id: "sync-balance", duration: 8000 });
                }
                mutate();
              } catch (e: any) {
                toast.error(e.message, { id: "sync-balance" });
              }
            }}
          >
            <RefreshCw className="h-4 w-4" /> Sync Balance
          </button>
          <button
            className="btn flex-1 sm:flex-none justify-center"
            onClick={() => trigger("/api/cron/analysis?force=1", "Running analysis…")}
          >
            <Activity className="h-4 w-4" /> Run Analysis
          </button>
          <button
            className="btn flex-1 sm:flex-none justify-center"
            onClick={() => trigger("/api/cron/positions?force=1", "Checking positions…")}
          >
            <ShieldCheck className="h-4 w-4" /> Check Positions
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat
          label="Portfolio Value"
          value={fmtUsd(stats?.portfolioValueUsdc ?? 0)}
          sub={
            <span className="mono">
              USDC · {stats?.dryRun ? "DRY RUN" : "LIVE"}
              {stats?.cashBalanceUpdatedAt && (
                <>
                  {" · "}
                  <span className="text-text-muted">
                    synced {new Date(stats.cashBalanceUpdatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </>
              )}
            </span>
          }
          accent="primary"
        />
        <Stat
          label="Today P&L"
          value={<span className={classOfPnl(pnlToday)}>{fmtUsd(pnlToday)}</span>}
          sub={<span className={`mono ${classOfPnl(pnlToday)}`}>{fmtPct(stats?.pnlTodayPercent ?? 0)}</span>}
          accent={pnlToday >= 0 ? "success" : "danger"}
        />
        <Stat
          label="Active Pairs"
          value={<span className="mono">{stats?.openPositions ?? 0}</span>}
          sub={<span className="mono text-text-muted">OPEN POSITIONS</span>}
          accent="secondary"
        />
        <Stat
          label="Win Rate"
          value={<span className="mono">{(stats?.winRate ?? 0).toFixed(1)}%</span>}
          sub={<span className="mono text-text-muted">{stats?.totalTrades ?? 0} closed</span>}
          accent="success"
        />
        <Stat
          label="AI Pilot"
          value={
            <span className={`inline-flex items-center gap-2 ${pilot ? "text-success" : "text-text-muted"}`}>
              {pilot ? <Zap className="h-5 w-5" /> : <Pause className="h-5 w-5" />} {pilot ? "ACTIVE" : "PAUSED"}
            </span>
          }
          sub={
            <span className="mono text-text-muted">
              5m: {stats?.positionCheckCronActive ? "ON" : "OFF"} · 15m: {stats?.analysisCronActive ? "ON" : "OFF"}
            </span>
          }
          accent={pilot ? "success" : "danger"}
        />
      </div>

      <OpenPositionsTable />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <PnlChart />
          <TradesChart />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HourlyBars />
            <DailyHeatmap />
          </div>
        </div>
        <div className="space-y-6">
          <AIDecisionLog />
          <TopPairs />
          <MarketOverview />
        </div>
      </div>
    </div>
  );
}
