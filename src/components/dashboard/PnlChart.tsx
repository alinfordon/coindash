"use client";

import { useState } from "react";
import useSWR from "swr";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const TABS = ["1h", "24h", "7d", "30d"] as const;
type Tab = (typeof TABS)[number];

export function PnlChart() {
  const [tab, setTab] = useState<Tab>("24h");
  const { data, isLoading } = useSWR<{ series: { t: number; cum: number; pnl: number }[] }>(
    `/api/dashboard/pnl?period=${tab}`
  );

  const series = (data?.series || []).map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit" }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative P&L</CardTitle>
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
              {t}
            </button>
          ))}
        </div>
      </CardHeader>
      <div className="h-64">
        {isLoading && !series.length ? (
          <div className="h-full w-full animate-pulse rounded-xl bg-surface-2/40" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="pnlArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00F5FF" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#00F5FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 2" stroke="#1A2A3A" />
              <XAxis
                dataKey="label"
                stroke="#5A7A9A"
                fontSize={10}
                tick={{ fill: "#5A7A9A" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#5A7A9A"
                fontSize={10}
                tick={{ fill: "#5A7A9A" }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(13,24,33,0.95)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#5A7A9A" }}
                formatter={(v: any) => [`$${(+v).toFixed(2)}`, "Cumulative"]}
              />
              <Area type="monotone" dataKey="cum" stroke="#00F5FF" strokeWidth={2} fill="url(#pnlArea)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
