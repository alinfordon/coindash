"use client";

import type { AnalyticsReport } from "@/lib/analytics";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtUsd } from "@/lib/utils";

const gridStroke = "#1A2A3A";
const tipStyle = {
  background: "rgba(13,24,33,0.95)",
  border: "1px solid #1A2A3A",
  borderRadius: 10,
  fontSize: 12,
};

export function AnalyticsCharts({ report }: { report: AnalyticsReport }) {
  const eq = report.equityCurve.map((p) => ({ ...p, label: p.label }));
  const dd = report.drawdownCurve;
  const bars = report.timeframePnL;
  const hist = report.winLossHistogram.map((h, i) => ({
    ...h,
    label: `${h.start.toFixed(1)}→${h.end.toFixed(1)}`,
    idx: i,
  }));
  const pairs = [...report.pnlByPair].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 14);
  const strat = [...report.strategyPerformance].slice(0, 12);

  return (
    <Tabs defaultValue="curves" className="mb-10">
      <TabsList className="flex-wrap">
        <TabsTrigger value="curves">Equity / Drawdown</TabsTrigger>
        <TabsTrigger value="period">Period P&L / Histogram</TabsTrigger>
        <TabsTrigger value="attribution">Pairs / Strategies</TabsTrigger>
      </TabsList>

      <TabsContent value="curves">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Equity Curve</CardTitle>
              <span className="text-[10px] mono text-text-muted uppercase tracking-widest">cumulative closed P&L</span>
            </CardHeader>
            <div className="h-72">
              {!eq.length ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={eq}>
                    <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} />
                    <XAxis dataKey="label" stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip contentStyle={tipStyle} formatter={(v: number) => fmtUsd(v)} labelStyle={{ color: "#5A7A9A" }} />
                    <Line type="monotone" dataKey="equity" stroke="#00F5FF" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Drawdown Curve</CardTitle>
              <span className="text-[10px] mono text-text-muted uppercase tracking-widest">vs portofoliu NAV · bucket PnL</span>
            </CardHeader>
            <div className="h-72">
              {!dd.length ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dd}>
                    <defs>
                      <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF3366" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#FF3366" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} />
                    <XAxis dataKey="label" stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip
                      contentStyle={tipStyle}
                      formatter={(v: number, name: string) =>
                        name === "ddPct" ? `${v.toFixed(2)}%` : fmtUsd(v as number)
                      }
                      labelStyle={{ color: "#5A7A9A" }}
                    />
                    <Area type="monotone" dataKey="ddPct" stroke="#FF3366" strokeWidth={2} fill="url(#ddFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="period">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Period Net P&L</CardTitle>
              <span className="text-[10px] mono text-text-muted uppercase tracking-widest">{report.filters.timeframe} buckets</span>
            </CardHeader>
            <div className="h-72">
              {!bars.length ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars}>
                    <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} />
                    <XAxis dataKey="label" stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip contentStyle={tipStyle} formatter={(v: number) => fmtUsd(v)} />
                    <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                      {bars.map((e, i) => (
                        <Cell key={i} fill={e.pnl >= 0 ? "#00FF88" : "#FF3366"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Win / Loss Distribution</CardTitle>
              <span className="text-[10px] mono text-text-muted uppercase tracking-widest">histogram of USDC P&L per trade</span>
            </CardHeader>
            <div className="h-72">
              {!hist.length ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hist}>
                    <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} />
                    <XAxis dataKey="label" stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={52} />
                    <YAxis stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      contentStyle={tipStyle}
                      formatter={(v: number, name: string) => (name === "count" ? v : fmtUsd(v))}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {hist.map((h, i) => (
                        <Cell key={i} fill={(h.start + h.end) / 2 >= 0 ? "#00FF8899" : "#FF336699"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="attribution">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>P&L by Pair</CardTitle>
              <span className="text-[10px] mono text-text-muted uppercase tracking-widest">top absolute movers</span>
            </CardHeader>
            <div className="h-80">
              {!pairs.length ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={pairs} margin={{ left: 16, right: 16 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} horizontal />
                    <XAxis type="number" stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="pair" stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} width={96} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tipStyle} formatter={(v: number) => fmtUsd(v)} />
                    <Bar dataKey="pnl" radius={[0, 6, 6, 0]}>
                      {pairs.map((e, i) => (
                        <Cell key={i} fill={e.pnl >= 0 ? "#00F5FF" : "#FF3366"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Strategy Comparison</CardTitle>
              <span className="text-[10px] mono text-text-muted uppercase tracking-widest">net P&L · grouped model / strategy tag</span>
            </CardHeader>
            <div className="h-80">
              {!strat.length ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={strat} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke={gridStroke} horizontal />
                    <XAxis type="number" stroke="#5A7A9A" tick={{ fill: "#5A7A9A", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="strategy" stroke="#5A7A9A" tick={{ fill: "#9BAFD4", fontSize: 10 }} width={120} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tipStyle} formatter={(v: number) => fmtUsd(v)} />
                    <Bar dataKey="pnl" radius={[0, 6, 6, 0]}>
                      {strat.map((e, i) => (
                        <Cell key={i} fill={e.pnl >= 0 ? "#7B2FFF" : "#FF3366"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/60 bg-surface-2/30">
      <p className="text-sm mono text-text-muted">No CLOSED trades in this filter window.</p>
    </div>
  );
}
