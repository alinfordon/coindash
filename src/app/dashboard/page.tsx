"use client";

import useSWR from "swr";
import { Stat } from "@/components/ui/Card";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";
import { OpenPositionsTable } from "@/components/dashboard/OpenPositionsTable";
import { PnlChart } from "@/components/dashboard/PnlChart";
import { HourlyBars } from "@/components/dashboard/HourlyBars";
import { DailyHeatmap } from "@/components/dashboard/DailyHeatmap";
import { AIDecisionLog } from "@/components/dashboard/AIDecisionLog";
import { TopPairs } from "@/components/dashboard/TopPairs";
import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { Zap, Pause, ShieldCheck, Activity, Target } from "lucide-react";
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
  const pnl24 = stats?.pnl24hUsdc ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Command Center</h1>
          <p className="text-sm text-text-muted mt-1 mono tracking-wider">AUTONOMOUS · AI-PILOTED · REAL-TIME</p>
        </div>
        <div className="flex gap-2">
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
          sub={<span className="mono">USDC · {stats?.dryRun ? "DRY RUN" : "LIVE"}</span>}
          accent="primary"
        />
        <Stat
          label="24H P&L"
          value={<span className={classOfPnl(pnl24)}>{fmtUsd(pnl24)}</span>}
          sub={<span className={`mono ${classOfPnl(pnl24)}`}>{fmtPct(stats?.pnl24hPercent ?? 0)}</span>}
          accent={pnl24 >= 0 ? "success" : "danger"}
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
