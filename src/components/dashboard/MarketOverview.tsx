"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";
import { TrendingUp, TrendingDown, Gauge } from "lucide-react";

export function MarketOverview() {
  const { data } = useSWR<{
    btc: { price: number; change24h: number } | null;
    btcDominanceApprox: number | null;
    fearGreed: { value: number; classification: string };
    topGainers: { symbol: string; change: number; price: number }[];
    topLosers: { symbol: string; change: number; price: number }[];
  }>("/api/market/overview");

  const fg = data?.fearGreed;
  const fgColor =
    !fg ? "text-text-muted" : fg.value < 25 ? "text-danger" : fg.value < 50 ? "text-warning" : fg.value < 75 ? "text-primary" : "text-success";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Overview</CardTitle>
      </CardHeader>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">BTC · USDC</div>
          <div className="mono text-lg mt-1">{data?.btc ? fmtUsd(data.btc.price) : "—"}</div>
          <div className={`mono text-xs ${classOfPnl(data?.btc?.change24h ?? 0)}`}>
            {fmtPct(data?.btc?.change24h ?? 0)}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-text-muted">BTC Dominance*</div>
          <div className="mono text-lg mt-1">{data?.btcDominanceApprox ? `${data.btcDominanceApprox}%` : "—"}</div>
          <div className="text-[10px] text-text-muted">approx · vs USDC vol</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-3">
          <div className="text-[10px] uppercase tracking-widest text-text-muted flex items-center gap-1">
            <Gauge className="h-3 w-3" /> Fear & Greed
          </div>
          <div className={`mono text-lg mt-1 ${fgColor}`}>{fg?.value ?? "—"}</div>
          <div className="text-[10px] text-text-muted">{fg?.classification || "—"}</div>
        </div>
      </div>
      <div className="divider my-4" />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] mono uppercase tracking-widest text-success mb-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Top Gainers
          </div>
          {(data?.topGainers ?? []).slice(0, 5).map((g) => (
            <div key={g.symbol} className="flex justify-between text-xs py-1">
              <span className="mono">{g.symbol.replace("USDC", "")}</span>
              <span className="text-success mono">{fmtPct(g.change)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="text-[10px] mono uppercase tracking-widest text-danger mb-1 flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Top Losers
          </div>
          {(data?.topLosers ?? []).slice(0, 5).map((g) => (
            <div key={g.symbol} className="flex justify-between text-xs py-1">
              <span className="mono">{g.symbol.replace("USDC", "")}</span>
              <span className="text-danger mono">{fmtPct(g.change)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
