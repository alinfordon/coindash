"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { MiniCandles } from "@/components/analysis/MiniChart";
import { classOfPnl, fmtNum, fmtPct } from "@/lib/utils";
import { Clock, Sparkles } from "lucide-react";

const recColor: Record<string, string> = {
  STRONG_BUY: "border-success text-success shadow-neon-green",
  BUY: "border-success/60 text-success",
  HOLD: "border-border text-text-muted",
  SELL: "border-danger/60 text-danger",
  STRONG_SELL: "border-danger text-danger shadow-neon-red",
};

export default function AnalysisPage() {
  const { data } = useSWR<{ analyses: any[] }>("/api/analysis/latest");
  const items = (data?.analyses || []).slice(0, 16);

  const nextRun = new Date();
  nextRun.setMinutes(Math.ceil((nextRun.getMinutes() + 1) / 15) * 15, 0, 0);
  const secsToNext = Math.max(0, Math.floor((nextRun.getTime() - Date.now()) / 1000));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Market Analysis</h1>
          <p className="text-sm text-text-muted mt-1 mono">AI-SIGNALED · UPDATED EVERY 15 MINUTES</p>
        </div>
        <div className="chip border-primary/40 text-primary">
          <Clock className="h-3 w-3" /> NEXT RUN IN {String(Math.floor(secsToNext / 60)).padStart(2, "0")}:{String(secsToNext % 60).padStart(2, "0")}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {items.length === 0 && (
          <Card>
            <div className="text-text-muted text-sm">
              No analyses yet. Trigger an analysis run from the dashboard or wait for the scheduled cron.
            </div>
          </Card>
        )}
        {items.map((a) => (
          <Card key={a._id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CardTitle>{a.pair}</CardTitle>
                <span className={`chip border ${recColor[a.recommendation] || "border-border text-text-muted"}`}>
                  {a.recommendation}
                </span>
                <span className="chip border-primary/30 text-primary">
                  <Sparkles className="h-3 w-3" /> {a.confidence}%
                </span>
              </div>
              <div className="text-[10px] mono text-text-muted">
                {new Date(a.analyzedAt).toLocaleString("en-US", { hour12: false })}
              </div>
            </CardHeader>

            <MiniCandles symbol={a.pair} />

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2">
                <div className="text-[10px] mono text-text-muted">RSI(14)</div>
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
                <div className="text-[10px] mono text-text-muted">24h Δ</div>
                <div className={`mono text-sm ${classOfPnl(a.indicators?.priceChange24h ?? 0)}`}>
                  {fmtPct(a.indicators?.priceChange24h ?? 0)}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="text-[10px] mono uppercase tracking-widest text-primary mb-1">AI REASONING</div>
              <div className="text-xs text-text-primary">{a.reasoning || "—"}</div>
              {a.keyFactors?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {a.keyFactors.map((f: string, i: number) => (
                    <span key={i} className="chip border-border text-text-muted text-[10px]">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
