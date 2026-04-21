"use client";

import useSWR from "swr";
import { useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const actionColor: Record<string, string> = {
  ANALYSIS: "text-primary border-primary/30",
  BUY_SIGNAL: "text-success border-success/30",
  SELL_SIGNAL: "text-danger border-danger/30",
  HOLD: "text-text-muted border-border",
  POSITION_CHECK: "text-secondary border-secondary/30",
  CRON_START: "text-text-muted border-border",
  CRON_END: "text-text-muted border-border",
  ERROR: "text-danger border-danger/50",
};

export function AIDecisionLog() {
  const { data } = useSWR<{ logs: any[] }>("/api/logs?limit=20");
  const logs = data?.logs || [];
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [logs?.[0]?._id]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>AI Decision Log</CardTitle>
        <span className="text-[10px] mono tracking-widest text-primary">LIVE</span>
      </CardHeader>
      <div ref={listRef} className="max-h-80 overflow-y-auto space-y-2 pr-1">
        {logs.length === 0 && <div className="text-text-muted text-sm">No decisions yet. Enable AI Pilot in Settings.</div>}
        {logs.map((l) => (
          <div
            key={l._id}
            className="flex items-start gap-3 rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2 animate-fadeUp"
          >
            <span className={cn("chip shrink-0 mono text-[10px]", actionColor[l.action] || "border-border text-text-muted")}>
              {l.action}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="mono text-text-primary">{l.pair || "—"}</span>
                {l.decision && <span className="text-text-muted">→</span>}
                {l.decision && <span className="text-text-primary font-medium">{l.decision}</span>}
                {typeof l.confidence === "number" && l.confidence > 0 && (
                  <span className="text-[11px] mono text-primary">{l.confidence}%</span>
                )}
              </div>
              {l.reasoning && <div className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{l.reasoning}</div>}
            </div>
            <div className="text-[10px] mono text-text-muted shrink-0">
              {new Date(l.timestamp).toLocaleTimeString("en-US", { hour12: false })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
