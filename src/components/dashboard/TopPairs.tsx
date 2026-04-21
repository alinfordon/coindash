"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { classOfPnl, fmtUsd } from "@/lib/utils";

export function TopPairs() {
  const { data } = useSWR<{ pairs: { pair: string; pnl: number; trades: number; spark: number[] }[] }>(
    "/api/dashboard/top-pairs"
  );
  const pairs = data?.pairs || [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Performing Pairs</CardTitle>
      </CardHeader>
      <div className="space-y-2">
        {pairs.length === 0 && <div className="text-sm text-text-muted">No closed trades yet.</div>}
        {pairs.map((p, i) => (
          <div
            key={p.pair}
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2"
          >
            <span className="text-[10px] mono text-text-muted w-6">#{i + 1}</span>
            <span className="mono font-semibold text-text-primary w-28">{p.pair}</span>
            <div className="flex-1 h-8">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={p.spark.map((v, idx) => ({ idx, v }))}>
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={p.pnl >= 0 ? "#00FF88" : "#FF3366"}
                    strokeWidth={1.6}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className={`mono text-xs w-24 text-right ${classOfPnl(p.pnl)}`}>{fmtUsd(p.pnl)}</div>
            <div className="text-[10px] mono text-text-muted w-10 text-right">{p.trades}x</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
