"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

export function DailyHeatmap() {
  const { data } = useSWR<{ cells: { day: string; pnl: number; trades: number }[] }>("/api/dashboard/daily");
  const cells = data?.cells || [];
  const max = Math.max(1, ...cells.map((c) => Math.abs(c.pnl)));

  const color = (pnl: number) => {
    if (!pnl) return "bg-surface-2/60 border-border/50";
    const intensity = Math.min(1, Math.abs(pnl) / max);
    if (pnl > 0) {
      return "";
    }
    return "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily P&L · Last 30 Days</CardTitle>
        <div className="text-[10px] mono uppercase tracking-widest text-text-muted flex items-center gap-2">
          <span>LOW</span>
          <span className="inline-block w-4 h-2 rounded-sm bg-danger/40" />
          <span className="inline-block w-4 h-2 rounded-sm bg-surface-2" />
          <span className="inline-block w-4 h-2 rounded-sm bg-success/40" />
          <span>HIGH</span>
        </div>
      </CardHeader>
      <div className="grid grid-cols-15 md:grid-cols-15 gap-1.5" style={{ gridTemplateColumns: "repeat(15, minmax(0, 1fr))" }}>
        {cells.map((c) => {
          const intensity = Math.min(1, Math.abs(c.pnl) / max);
          const bg =
            c.pnl === 0
              ? "rgba(26, 42, 58, 0.5)"
              : c.pnl > 0
              ? `rgba(0, 255, 136, ${0.12 + intensity * 0.55})`
              : `rgba(255, 51, 102, ${0.12 + intensity * 0.55})`;
          const border = c.pnl > 0 ? "rgba(0,255,136,0.3)" : c.pnl < 0 ? "rgba(255,51,102,0.3)" : "rgba(26,42,58,0.6)";
          const d = new Date(c.day);
          return (
            <div
              key={c.day}
              title={`${c.day} · $${c.pnl.toFixed(2)} · ${c.trades} trades`}
              className="aspect-square rounded-md border flex items-center justify-center text-[9px] mono text-text-muted"
              style={{ background: bg, borderColor: border, boxShadow: c.pnl !== 0 ? `0 0 8px ${border}` : undefined }}
            >
              {d.getDate()}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
