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

export default function DashboardPage() {
  const { data: stats, mutate } = useSWR<any>("/api/dashboard/stats");

  async function trigger(path: string, label: string) {
    toast.loading(label, { id: path });
    try {
      const r = await fetch(path, { method: "POST" });
      const j = await r.json();
      if (path.includes("analysis")) {
        const summary = j.reason || `Analyzed ${j.analyzed ?? 0}, opened ${j.opened ?? 0}`;
        if ((j.opened ?? 0) > 0) toast.success(summary, { id: path, duration: 8000 });
        else toast.warning?.(summary, { id: path, duration: 12000 }) ?? toast(summary, { id: path, duration: 12000 });
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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Command Center</h1>
          <p className="text-sm text-text-muted mt-1 mono tracking-wider">AUTONOMOUS · AI-PILOTED · REAL-TIME</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn"
            onClick={async () => {
              toast.loading("Syncing balance…", { id: "sync-balance" });
              try {
                const r = await fetch("/api/balance/sync", { method: "POST" });
                const j = await r.json();
                if (j.ok) toast.success(`Balance: $${(+j.total).toFixed(2)}`, { id: "sync-balance" });
                else toast.error(j.error || "sync failed", { id: "sync-balance", duration: 8000 });
                mutate();
              } catch (e: any) {
                toast.error(e.message, { id: "sync-balance" });
              }
            }}
          >
            <RefreshCw className="h-4 w-4" /> Sync Balance
          </button>
          <button className="btn" onClick={() => trigger("/api/cron/analysis", "Running analysis…")}>
            <Activity className="h-4 w-4" /> Run Analysis
          </button>
          <button className="btn" onClick={() => trigger("/api/cron/positions", "Checking positions…")}>
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
