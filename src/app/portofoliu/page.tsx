"use client";

import useSWR from "swr";
import { toast } from "sonner";
import { Card, Stat } from "@/components/ui/Card";
import { PortfolioHoldingsTable } from "@/components/portfolio/PortfolioHoldingsTable";
import { PortfolioTargetsEditor } from "@/components/portfolio/PortfolioTargetsEditor";
import { RebalancePlanCard } from "@/components/portfolio/RebalancePlanCard";
import { PortfolioAiPanel } from "@/components/portfolio/PortfolioAiPanel";
import type { InvestPortfolioView } from "@/lib/investPortfolioTypes";
import { fmtPct, fmtUsd } from "@/lib/utils";
import { Briefcase, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  });

export default function PortofoliuPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<{ portfolio: InvestPortfolioView }>(
    "/api/portfolio",
    fetcher,
    { refreshInterval: 120_000 }
  );

  const p = data?.portfolio;
  const snap = p?.snapshot;

  async function refresh() {
    toast.loading("Sincronizare Binance…", { id: "pf-sync" });
    try {
      await fetch("/api/balance/sync", { method: "POST" });
      await mutate();
      toast.success("Portofoliu actualizat", { id: "pf-sync" });
    } catch (e: any) {
      toast.error(e.message || "Sync eșuat", { id: "pf-sync" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-7 w-7 text-primary" />
            Portofolio long-term
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1 mono tracking-wider">
            INVESTIȚII · ALOCARE · REBALANSARE · AI
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(isLoading || isValidating) && (
            <span className="chip border-border text-text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Sync…
            </span>
          )}
          <button type="button" className="btn" onClick={refresh}>
            <RefreshCw className="h-4 w-4" /> Sincronizează
          </button>
        </div>
      </div>

      {error && (
        <Card className="border-danger/40 bg-danger/5 text-danger text-sm">
          {error.message}
        </Card>
      )}

      {snap?.portfolioError && (
        <Card className="border-warning/40 bg-warning/5 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>
            Binance: {snap.portfolioError} — se folosește ultimul snapshot salvat (
            {fmtUsd(snap.totalUsdc)}).
          </span>
        </Card>
      )}

      {p && snap && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Valoare totală" value={fmtUsd(snap.totalUsdc)} accent="primary" />
            <Stat
              label="Investabil LT"
              value={fmtUsd(snap.investableUsdc)}
              sub={`${fmtUsd(snap.tradingLockedUsdc)} în trading`}
              accent="secondary"
            />
            <Stat
              label="Drift maxim"
              value={fmtPct(snap.maxDriftPct)}
              sub={snap.needsRebalance ? "Rebalansare recomandată" : "În limite"}
              accent={snap.needsRebalance ? "danger" : "success"}
            />
            <Stat
              label="Prag rebalansare"
              value={`${p.rebalanceThresholdPct}%`}
              sub={`${snap.rebalancePlan.length} acțiuni sugerate`}
              accent="primary"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="mb-4">
                <h3 className="font-heading text-sm tracking-widest uppercase text-text-muted">
                  Alocare curentă
                </h3>
              </div>
              <PortfolioHoldingsTable
                holdings={snap.holdings}
                dustHiddenCount={snap.dustHiddenCount}
              />
            </Card>

            <RebalancePlanCard
              plan={snap.rebalancePlan}
              threshold={p.rebalanceThresholdPct}
              needsRebalance={snap.needsRebalance}
              onTradeSuccess={() => mutate()}
            />
          </div>

          <PortfolioAiPanel
            advice={p.lastAiAdvice}
            adviceAt={p.lastAiAdviceAt}
            portfolioTotalUsdc={snap.totalUsdc}
            onGenerated={() => mutate()}
            onTradeSuccess={() => mutate()}
          />

          <PortfolioTargetsEditor
            targets={p.targets}
            threshold={p.rebalanceThresholdPct}
            onSaved={() => mutate()}
          />
        </>
      )}

      {isLoading && !p && (
        <Card className="text-sm text-text-muted flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă portofoliul…
        </Card>
      )}
    </div>
  );
}
