"use client";

import { useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatsFilterState = {
  from: string;
  to: string;
  pair: string;
  strategy: string;
  timeframe: "daily" | "weekly" | "monthly";
  timezone: string;
  liveRefresh: boolean;
  includeOpen: boolean;
};

const TZ_PRESETS = ["UTC", "Europe/Bucharest", "America/New_York", "Asia/Tokyo"];

export function buildAnalyticsQuery(f: StatsFilterState): string {
  const q = new URLSearchParams();
  if (f.from) q.set("from", new Date(f.from + "T00:00:00.000Z").toISOString());
  if (f.to) q.set("to", new Date(f.to + "T23:59:59.999Z").toISOString());
  if (f.pair && f.pair !== "__all__") q.set("pair", f.pair);
  if (f.strategy && f.strategy !== "__all__") q.set("strategy", f.strategy);
  q.set("timeframe", f.timeframe);
  q.set("timezone", f.timezone);
  if (f.includeOpen) q.set("includeOpen", "true");
  return q.toString();
}

export function AnalyticsFiltersBar({
  value,
  onChange,
  pairs,
  strategies,
  disabled,
}: {
  value: StatsFilterState;
  onChange: (next: StatsFilterState) => void;
  pairs: string[];
  strategies: string[];
  disabled?: boolean;
}) {
  const pairOpts = useMemo(() => ["__all__", ...pairs], [pairs]);
  const stratOpts = useMemo(() => ["__all__", ...strategies], [strategies]);

  const patch = (p: Partial<StatsFilterState>) => onChange({ ...value, ...p });

  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 py-4 mb-6",
        "border-b border-border/70 bg-[#050A0F]/90 backdrop-blur-xl shadow-[0_12px_40px_-20px_rgba(0,0,0,0.85)]"
      )}
    >
      <div className="flex flex-wrap items-end gap-3 lg:gap-4">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <span className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted">From</span>
          <input
            type="date"
            disabled={disabled}
            className="rounded-lg border border-border/70 bg-surface-2/80 px-3 py-2 text-sm mono text-text-primary focus:border-primary/50 outline-none transition"
            value={value.from}
            onChange={(e) => patch({ from: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <span className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted">To</span>
          <input
            type="date"
            disabled={disabled}
            className="rounded-lg border border-border/70 bg-surface-2/80 px-3 py-2 text-sm mono text-text-primary focus:border-primary/50 outline-none transition"
            value={value.to}
            onChange={(e) => patch({ to: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[160px] flex-1">
          <span className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted">Pair</span>
          <select
            disabled={disabled}
            className="rounded-lg border border-border/70 bg-surface-2/80 px-3 py-2 text-sm mono text-text-primary focus:border-primary/50 outline-none transition"
            value={value.pair || "__all__"}
            onChange={(e) => patch({ pair: e.target.value })}
          >
            {pairOpts.map((p) => (
              <option key={p} value={p}>
                {p === "__all__" ? "All pairs" : p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[160px] flex-1">
          <span className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted">Strategy</span>
          <select
            disabled={disabled}
            className="rounded-lg border border-border/70 bg-surface-2/80 px-3 py-2 text-sm mono text-text-primary focus:border-primary/50 outline-none transition"
            value={value.strategy || "__all__"}
            onChange={(e) => patch({ strategy: e.target.value })}
          >
            {stratOpts.map((s) => (
              <option key={s} value={s}>
                {s === "__all__" ? "All strategies" : s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[140px]">
          <span className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted">Timeframe</span>
          <select
            disabled={disabled}
            className="rounded-lg border border-border/70 bg-surface-2/80 px-3 py-2 text-sm mono text-text-primary focus:border-primary/50 outline-none transition"
            value={value.timeframe}
            onChange={(e) => patch({ timeframe: e.target.value as StatsFilterState["timeframe"] })}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[160px]">
          <span className="text-[10px] font-heading uppercase tracking-[0.2em] text-text-muted">Timezone</span>
          <select
            disabled={disabled}
            className="rounded-lg border border-border/70 bg-surface-2/80 px-3 py-2 text-sm mono text-text-primary focus:border-primary/50 outline-none transition"
            value={value.timezone}
            onChange={(e) => patch({ timezone: e.target.value })}
          >
            {TZ_PRESETS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-6 ml-auto pt-5 md:pt-6 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Switch checked={value.liveRefresh} onCheckedChange={(v) => patch({ liveRefresh: !!v })} disabled={disabled} />
            <span className="text-xs mono text-text-muted uppercase tracking-wider">Live</span>
            {value.liveRefresh && <Badge variant="accent">15s</Badge>}
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Switch checked={value.includeOpen} onCheckedChange={(v) => patch({ includeOpen: !!v })} disabled={disabled} />
            <span className="text-xs mono text-text-muted uppercase tracking-wider">Show open</span>
          </label>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-text-muted mono leading-relaxed">
        KPIs and curves use <span className="text-primary">CLOSED</span> trades only (dashboard dust rules apply). Open positions appear only in Recent Trades when enabled.
      </p>
    </div>
  );
}
