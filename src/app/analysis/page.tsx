"use client";

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { MiniCandles } from "@/components/analysis/MiniChart";
import { AnalysisBuyModal } from "@/components/analysis/AnalysisBuyModal";
import { classOfPnl, fmtNum, fmtPct, fmtUsd } from "@/lib/utils";
import { Clock, Sparkles, AlertCircle, Loader2, ShoppingCart } from "lucide-react";
import {
  ANALYSIS_CRON_INTERVAL_MINUTES,
  computeAnalysisSchedule,
  formatAnalysisCountdown,
} from "@/lib/analysisSchedule";

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

const recColor: Record<string, string> = {
  STRONG_BUY: "border-success text-success shadow-neon-green",
  BUY: "border-success/60 text-success",
  HOLD: "border-border text-text-muted",
  SELL: "border-danger/60 text-danger",
  STRONG_SELL: "border-danger text-danger shadow-neon-red",
};

type AnalysisRow = {
  _id: string;
  pair: string;
  analyzedAt: string;
  interval?: string;
  entryInterval?: string;
  recommendation: string;
  confidence: number;
  technicalScore?: number;
  price?: number;
  reasoning?: string;
  keyFactors?: string[];
  aiProvider?: string;
  aiModel?: string;
  indicators?: {
    rsi?: number;
    macd?: { histogram?: number };
    ema20?: number;
    ema50?: number;
    priceChange24h?: number;
    trendInterval?: string;
    entryInterval?: string;
    rsi15m?: number;
  };
};

export default function AnalysisPage() {
  const { mutate: globalMutate } = useSWRConfig();
  const { data: settings } = useSWR<{ binanceTestnet?: boolean }>("/api/settings", fetcher);
  const { data, error, isLoading, isValidating } = useSWR<{ analyses: AnalysisRow[] }>(
    "/api/analysis/latest",
    fetcher,
    { refreshInterval: 60_000 }
  );

  useEffect(() => {
    if (data?.analyses?.[0]?.analyzedAt) {
      void globalMutate("/api/analysis/schedule");
    }
  }, [data?.analyses?.[0]?.analyzedAt, globalMutate]);

  const [mounted, setMounted] = useState(false);
  const [buyTarget, setBuyTarget] = useState<AnalysisRow | null>(null);
  useEffect(() => setMounted(true), []);

  const testnet = settings?.binanceTestnet ?? true;
  const items = (data?.analyses || []).slice(0, 16);
  const latestAt = items[0]?.analyzedAt ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold">Market Analysis</h1>
          <p className="text-sm text-text-muted mt-1 mono">
            Real Binance TA + AI · per your account
            {settings != null && (
              <> · {testnet ? "TESTNET" : "LIVE"} candles on charts</>
            )}
          </p>
          {mounted && latestAt && (
            <p className="text-[10px] mono text-text-muted mt-1">
              Latest scan: {formatRoDateTime(latestAt)} · {items.length} pairs shown
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(isLoading || isValidating) && (
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {!error && isLoading && !data && (
          <Card>
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading analyses…
            </div>
          </Card>
        )}
        {!error && !isLoading && items.length === 0 && (
          <Card>
            <div className="text-text-muted text-sm space-y-2">
              <p>No analyses for your account yet.</p>
              <p className="text-[11px] mono">
                Run Analysis from Dashboard (with AI configured) or wait for the 15m cron.
              </p>
            </div>
          </Card>
        )}
        {items.map((a) => {
          const trendTf = a.interval || a.indicators?.trendInterval || "1h";
          const entryTf = a.entryInterval || a.indicators?.entryInterval || "15m";
          const entryRsi = a.indicators?.rsi15m;
          return (
            <Card key={a._id}>
              <CardHeader className="flex-col items-stretch gap-2">
                <div className="flex w-full flex-wrap items-center gap-2">
                  <CardTitle>{a.pair}</CardTitle>
                  <span className={`chip border ${recColor[a.recommendation] || "border-border text-text-muted"}`}>
                    {a.recommendation}
                  </span>
                  <span className="chip border-primary/30 text-primary">
                    <Sparkles className="h-3 w-3" /> {a.confidence}%
                  </span>
                  {a.technicalScore != null && (
                    <span className="chip border-border text-text-muted text-[10px] mono">
                      TA {a.technicalScore > 0 ? "+" : ""}
                      {a.technicalScore}
                    </span>
                  )}
                  <button
                    type="button"
                    className="chip border-success/50 text-success hover:bg-success/10 transition-colors sm:ml-auto"
                    onClick={() => setBuyTarget(a)}
                  >
                    <ShoppingCart className="h-3 w-3" /> BUY
                  </button>
                </div>
                <div className="text-[10px] mono text-text-muted space-y-0.5 mt-1">
                  {mounted && <div>{formatRoDateTime(a.analyzedAt)}</div>}
                  <div>
                    Price @ scan: {a.price != null ? fmtUsd(a.price, 4) : "—"} · TF {trendTf}/{entryTf}
                    {a.aiProvider && (
                      <>
                        {" "}
                        · {a.aiProvider}
                        {a.aiModel ? ` / ${a.aiModel}` : ""}
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>

              <MiniCandles symbol={a.pair} testnet={testnet} interval={trendTf} />

              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2">
                  <div className="text-[10px] mono text-text-muted">RSI {trendTf}</div>
                  <div className="mono text-sm">{fmtNum(a.indicators?.rsi, 2)}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2">
                  <div className="text-[10px] mono text-text-muted">MACD hist</div>
                  <div className={`mono text-sm ${classOfPnl(a.indicators?.macd?.histogram ?? 0)}`}>
                    {fmtNum(a.indicators?.macd?.histogram, 4)}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2">
                  <div className="text-[10px] mono text-text-muted">EMA 20/50</div>
                  <div className="mono text-sm">
                    {fmtNum(a.indicators?.ema20, 4)} / {fmtNum(a.indicators?.ema50, 4)}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2">
                  <div className="text-[10px] mono text-text-muted">24h Δ · RSI {entryTf}</div>
                  <div className={`mono text-sm ${classOfPnl(a.indicators?.priceChange24h ?? 0)}`}>
                    {fmtPct(a.indicators?.priceChange24h ?? 0)}
                  </div>
                  {entryRsi != null && (
                    <div className="mono text-[10px] text-text-muted mt-0.5">entry RSI {fmtNum(entryRsi, 1)}</div>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="text-[10px] mono uppercase tracking-widest text-primary mb-1">Raționament AI</div>
                <div className="text-xs text-text-primary">{a.reasoning || "—"}</div>
                {a.keyFactors && a.keyFactors.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.keyFactors.map((f, i) => (
                      <span key={i} className="chip border-border text-text-muted text-[10px]">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

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
      />
    </div>
  );
}
