"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Card } from "@/components/ui/Card";
import { AnalysisBuyModal } from "@/components/analysis/AnalysisBuyModal";
import { AnalysisListRow } from "@/components/analysis/AnalysisListRow";
import type { AnalysisListItem } from "@/lib/analysisDisplayTypes";
import { normalizeAnalysisIndicators } from "@/lib/analysisIndicators";
import { normalizeAnalysisIntervalPair } from "@/lib/analysisIntervals";
import { Clock, AlertCircle, Loader2 } from "lucide-react";
import {
  ANALYSIS_CRON_INTERVAL_MINUTES,
  computeAnalysisSchedule,
  formatAnalysisCountdown,
} from "@/lib/analysisSchedule";
import { SWR_ANALYSIS_LIST, SWR_SETTINGS } from "@/lib/swrDefaults";
import { ANALYSIS_RETENTION_LIMIT } from "@/lib/analysisConstants";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

function formatRoDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function CronCountdown() {
  const { data } = useSWR<{
    lastAnalysisAt?: string | null;
    cronEnabled?: boolean;
    overdue?: boolean;
    intervalMinutes?: number;
  }>("/api/analysis/schedule", fetcher, { refreshInterval: 15_000 });

  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const lastRunAt = data?.lastAnalysisAt ?? null;
  const schedule =
    now != null ? computeAnalysisSchedule(lastRunAt, now) : { secsUntil: null as number | null, overdue: false };

  const label =
    schedule.secsUntil == null
      ? "--:--"
      : schedule.overdue
        ? "00:00"
        : formatAnalysisCountdown(schedule.secsUntil);

  const cronOff = data && data.cronEnabled === false;

  return (
    <div
      className={`chip ${cronOff ? "border-border text-text-muted" : "border-primary/40 text-primary"}`}
      title={
        lastRunAt
          ? `Ultima analiză: ${formatRoDateTime(lastRunAt)} · interval ${data?.intervalMinutes ?? ANALYSIS_CRON_INTERVAL_MINUTES} min`
          : `Interval ${data?.intervalMinutes ?? ANALYSIS_CRON_INTERVAL_MINUTES} min`
      }
    >
      <Clock className="h-3 w-3" />
      {cronOff ? "CRON OFF" : <>NEXT RUN {label}</>}
    </div>
  );
}

export default function AnalysisPage() {
  const { mutate: globalMutate } = useSWRConfig();
  const { data: settings } = useSWR<{
    binanceTestnet?: boolean;
    analysisTrendInterval?: string;
    analysisEntryInterval?: string;
    analysisIndicators?: Record<string, boolean>;
  }>("/api/settings", fetcher, SWR_SETTINGS);
  const { data, error, isLoading, isValidating } = useSWR<{ analyses: AnalysisListItem[] }>(
    "/api/analysis/latest",
    fetcher,
    SWR_ANALYSIS_LIST
  );

  useEffect(() => {
    if (data?.analyses?.[0]?.analyzedAt) {
      void globalMutate("/api/analysis/schedule");
    }
  }, [data?.analyses?.[0]?.analyzedAt, globalMutate]);

  const [mounted, setMounted] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [buyTarget, setBuyTarget] = useState<AnalysisListItem | null>(null);
  useEffect(() => setMounted(true), []);

  const testnet = settings?.binanceTestnet ?? true;
  const items = data?.analyses || [];
  const latestAt = items[0]?.analyzedAt ?? null;

  const { trend: settingsTrend, entry: settingsEntry } = normalizeAnalysisIntervalPair(
    settings?.analysisTrendInterval,
    settings?.analysisEntryInterval
  );
  const visible = useMemo(
    () => normalizeAnalysisIndicators(settings?.analysisIndicators),
    [settings?.analysisIndicators]
  );

  const visibleKey = useMemo(() => JSON.stringify(visible), [visible]);

  const displayCtx = useMemo(
    () => ({
      trendTf: settingsTrend,
      entryTf: settingsEntry,
      visible,
      visibleKey,
    }),
    [settingsTrend, settingsEntry, visibleKey, visible]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold">Market Analysis</h1>
          <p className="text-sm text-text-muted mt-1 mono">
            Real Binance TA + AI · ultimele {ANALYSIS_RETENTION_LIMIT} analize
            {settings != null && <> · {testnet ? "TESTNET" : "LIVE"} candles</>}
          </p>
          {mounted && latestAt && (
            <p className="text-[10px] mono text-text-muted mt-1">
              Latest scan: {formatRoDateTime(latestAt)} · {items.length} pairs
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(isLoading || (isValidating && !data)) && (
            <span className="chip border-border text-text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
            </span>
          )}
          <CronCountdown />
        </div>
      </div>

      {error && (
        <Card className="border-danger/40 bg-danger/5">
          <div className="flex items-center gap-2 text-danger text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Could not load analyses — {error.message}
          </div>
        </Card>
      )}

      {!error && isLoading && !data && (
        <Card>
          <div className="flex items-center gap-2 text-text-muted text-sm p-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading analyses…
          </div>
        </Card>
      )}

      {!error && !isLoading && items.length === 0 && (
        <Card>
          <div className="text-text-muted text-sm space-y-2 p-4">
            <p>No analyses for your account yet.</p>
            <p className="text-[11px] mono">
              Run Analysis from Dashboard (with AI configured) or wait for the next analysis cron.
            </p>
          </div>
        </Card>
      )}

      {items.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div role="list">
            {items.map((a) => {
              const trendTf = a.interval || a.indicators?.trendInterval || settingsTrend;
              const entryTf = a.entryInterval || a.indicators?.entryInterval || settingsEntry;
              const rowCtx = { ...displayCtx, trendTf, entryTf };
              return (
                <AnalysisListRow
                  key={a._id}
                  item={a}
                  expanded={expandedId === a._id}
                  onToggle={() => setExpandedId((id) => (id === a._id ? null : a._id))}
                  onBuy={() => setBuyTarget(a)}
                  ctx={rowCtx}
                  testnet={testnet}
                  formattedAt={mounted ? formatRoDateTime(a.analyzedAt) : undefined}
                />
              );
            })}
          </div>
        </Card>
      )}

      <AnalysisBuyModal
        open={buyTarget != null}
        onOpenChange={(open) => {
          if (!open) setBuyTarget(null);
        }}
        pair={buyTarget?.pair ?? ""}
        price={buyTarget?.price}
        source="Analysis"
        confidence={buyTarget?.confidence}
        reasoning={buyTarget?.reasoning}
        indicators={buyTarget?.indicators}
        trendInterval={buyTarget?.interval ?? buyTarget?.indicators?.trendInterval}
        entryInterval={buyTarget?.entryInterval ?? buyTarget?.indicators?.entryInterval}
        indicatorConfig={visible}
      />
    </div>
  );
}
