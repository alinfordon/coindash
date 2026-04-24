"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn, fmtUsd } from "@/lib/utils";

const TABS = ["1d", "7d", "30d", "1y"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  "1d": "1D",
  "7d": "7D",
  "30d": "30D",
  "1y": "1Y",
};

type TradePoint = {
  t: number;
  pair: string;
  pnl: number;
  pnlPct: number;
  reason: string;
};

const PROFIT = "#00FF88";
const LOSS = "#FF3366";

export function TradesChart() {
  const [tab, setTab] = useState<Tab>("7d");
  const { data, isLoading } = useSWR<{
    series: TradePoint[];
    wins: number;
    losses: number;
    totalPnl: number;
  }>(`/api/dashboard/trades?period=${tab}`);

  const series = data?.series || [];

  // Build cumulative wins / losses over time. Each trade contributes either to
  // the profit running total or the (absolute) loss running total, so both
  // lines start at 0 and only ever grow — like revenue vs expenses.
  const chartData = useMemo(() => {
    let cumWins = 0;
    let cumLosses = 0;
    return series.map((p) => {
      if (p.pnl >= 0) cumWins += p.pnl;
      else cumLosses += Math.abs(p.pnl);
      return {
        t: p.t,
        pair: p.pair,
        pnl: p.pnl,
        pnlPct: p.pnlPct,
        reason: p.reason,
        wins: +cumWins.toFixed(4),
        losses: +cumLosses.toFixed(4),
      };
    });
  }, [series]);

  const totalWins = chartData.length ? chartData[chartData.length - 1].wins : 0;
  const totalLosses = chartData.length ? chartData[chartData.length - 1].losses : 0;
  const net = +(totalWins - totalLosses).toFixed(4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profits vs Losses</CardTitle>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1 rounded-md text-xs mono uppercase tracking-widest border transition",
                tab === t
                  ? "bg-primary/15 border-primary/50 text-primary shadow-neon"
                  : "border-border text-text-muted hover:text-text-primary"
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </CardHeader>

      <div className="mb-4 flex flex-wrap gap-6 text-xs mono">
        <Legend color={PROFIT} label="PROFITS" value={fmtUsd(totalWins)} count={data?.wins ?? 0} />
        <Legend color={LOSS} label="LOSSES" value={fmtUsd(totalLosses)} count={data?.losses ?? 0} />
        <span className="text-text-muted">
          NET ·{" "}
          <span className={net >= 0 ? "text-profit" : "text-loss"}>{fmtUsd(net)}</span>
        </span>
      </div>

      <div className="h-72">
        {isLoading && !series.length ? (
          <div className="h-full w-full animate-pulse rounded-xl bg-surface-2/40" />
        ) : !series.length ? (
          <div className="h-full w-full flex items-center justify-center text-text-muted mono text-xs">
            NO CLOSED TRADES IN THIS PERIOD
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <defs>
                <linearGradient id="winsArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PROFIT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={PROFIT} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="lossesArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LOSS} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={LOSS} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 2" stroke="#1A2A3A" />
              <XAxis
                type="number"
                dataKey="t"
                domain={["dataMin", "dataMax"]}
                stroke="#5A7A9A"
                fontSize={10}
                tick={{ fill: "#5A7A9A" }}
                tickLine={false}
                axisLine={false}
                scale="time"
                tickFormatter={(v: number) => formatLabel(v, tab)}
                minTickGap={60}
              />
              <YAxis
                type="number"
                stroke="#5A7A9A"
                fontSize={10}
                tick={{ fill: "#5A7A9A" }}
                tickLine={false}
                axisLine={false}
                width={60}
                tickFormatter={(v: number) => `$${(+v).toFixed(0)}`}
              />
              <Tooltip
                cursor={{ stroke: "#1A2A3A", strokeDasharray: "3 3" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as TradePoint & { wins: number; losses: number };
                  return (
                    <div className="rounded-lg border border-border bg-bg/95 px-3 py-2 text-xs mono shadow-lg min-w-[180px]">
                      <div className="text-text-muted mb-1">
                        {new Date((label as number) || p.t).toLocaleString("en-GB", {
                          year: "2-digit",
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="text-text-primary font-heading tracking-wider">{p.pair}</div>
                      <div className={p.pnl >= 0 ? "text-profit" : "text-loss"}>
                        Trade: {fmtUsd(p.pnl)}
                      </div>
                      <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5">
                        <div className="flex justify-between gap-4">
                          <span className="text-profit">Profits</span>
                          <span>{fmtUsd(p.wins)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-loss">Losses</span>
                          <span>{fmtUsd(p.losses)}</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="losses"
                stroke={LOSS}
                strokeWidth={2}
                fill="url(#lossesArea)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: LOSS }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="wins"
                stroke={PROFIT}
                strokeWidth={2}
                fill="url(#winsArea)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: PROFIT }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function Legend({
  color,
  label,
  value,
  count,
}: {
  color: string;
  label: string;
  value: string;
  count: number;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
      <span className="text-text-muted">{label}</span>
      <span style={{ color }}>{value}</span>
      <span className="text-text-muted">· {count}</span>
    </span>
  );
}

function formatLabel(ts: number, period: Tab) {
  const d = new Date(ts);
  if (period === "1d") {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  if (period === "7d" || period === "30d") {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}
