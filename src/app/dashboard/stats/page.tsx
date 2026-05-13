"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import type { AnalyticsReport } from "@/lib/analytics";
import {
  AnalyticsFiltersBar,
  buildAnalyticsQuery,
  type StatsFilterState,
} from "@/components/analytics/AnalyticsFiltersBar";
import { AnalyticsKpiStrip } from "@/components/analytics/AnalyticsKpiStrip";
import { AnalyticsPeriodReturns } from "@/components/analytics/AnalyticsPeriodReturns";
import { AnalyticsPortfolioReturns } from "@/components/analytics/AnalyticsPortfolioReturns";
import { AnalyticsRiskStrip } from "@/components/analytics/AnalyticsRiskStrip";
import { AnalyticsCharts } from "@/components/analytics/AnalyticsCharts";
import { AnalyticsTables } from "@/components/analytics/AnalyticsTables";
import { AnalyticsInsightsPanel } from "@/components/analytics/AnalyticsInsights";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Activity } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});

const DEFAULT_FILTERS = (): StatsFilterState => ({
  from: "",
  to: "",
  pair: "__all__",
  strategy: "__all__",
  timeframe: "daily",
  timezone: "Europe/Bucharest",
  liveRefresh: false,
  includeOpen: false,
});

export default function StatsPage() {
  const [filters, setFilters] = useState<StatsFilterState>(DEFAULT_FILTERS);

  const qs = useMemo(() => buildAnalyticsQuery(filters), [filters]);
  const { data, error, isLoading, isValidating } = useSWR<AnalyticsReport>(`/api/analytics?${qs}`, fetcher, {
    refreshInterval: filters.liveRefresh ? 15000 : 0,
  });

  const pairs = data?.filterOptions?.pairs ?? [];
  const strategies = data?.filterOptions?.strategies ?? [];

  return (
    <TooltipProvider delayDuration={180}>
      <div className="max-w-[1600px] mx-auto relative">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">Performance Analytics</h1>
            <p className="text-xs sm:text-sm text-text-muted mt-1 mono tracking-wider uppercase">
              Institutional-grade quant diagnostics · CLOSED-trade baseline
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] mono text-text-muted">
            {(isLoading || isValidating) && (
              <>
                <Activity className="h-4 w-4 animate-pulse text-primary" />
                Refreshing…
              </>
            )}
            {error && <span className="text-danger">Load error — adjust filters or retry.</span>}
          </div>
        </div>

        <AnalyticsFiltersBar
          value={filters}
          onChange={setFilters}
          pairs={pairs}
          strategies={strategies}
          disabled={isLoading && !data}
        />

        {!data && isLoading ? (
          <div className="grid gap-4 animate-pulse">
            <div className="h-28 rounded-2xl bg-surface-2/40 border border-border/40" />
            <div className="h-40 rounded-2xl bg-surface-2/40 border border-border/40" />
            <div className="h-96 rounded-2xl bg-surface-2/40 border border-border/40" />
          </div>
        ) : data ? (
          <>
            <AnalyticsKpiStrip m={data.metrics} />
            <AnalyticsPeriodReturns m={data.metrics} timeZone={data.filters.timezone} />
            <AnalyticsPortfolioReturns m={data.metrics} />
            <AnalyticsRiskStrip m={data.metrics} />
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 mb-10">
              <AnalyticsCharts report={data} />
              <AnalyticsInsightsPanel insights={data.insights} />
            </div>
            <AnalyticsTables report={data} />
          </>
        ) : (
          <p className="text-text-muted mono text-sm">Unable to load analytics.</p>
        )}
      </div>
    </TooltipProvider>
  );
}
