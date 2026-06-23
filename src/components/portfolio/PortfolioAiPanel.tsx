"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn, fmtUsd } from "@/lib/utils";
import type { PortfolioAiAdvice } from "@/lib/investPortfolioTypes";
import type { PiataRow } from "@/lib/marketPiata";
import { ManualTradeModal } from "@/components/analysis/AnalysisBuyModal";
import { Brain, Loader2, ShoppingCart, Sparkles } from "lucide-react";

type Props = {
  advice: PortfolioAiAdvice | null;
  adviceAt: string | null;
  portfolioTotalUsdc?: number;
  onGenerated: () => void;
  onTradeSuccess?: () => void;
};

const urgencyStyle = {
  LOW: "border-success/40 text-success bg-success/10",
  MEDIUM: "border-warning/40 text-warning bg-warning/10",
  HIGH: "border-danger/40 text-danger bg-danger/10",
};

const STABLES = new Set(["USDC", "USDT", "BUSD", "FDUSD", "TUSD", "DAI", "USDP", "PYUSD"]);

type BuyModalState = {
  pair: string;
  price?: number;
  usdc?: number;
  asset: string;
  label: string;
};

type PiataData = { catalog?: PiataRow[] };

const piataFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

function findPiataRow(catalog: PiataRow[], asset: string): PiataRow | undefined {
  return catalog.find((r) => r.base === asset || r.symbol === `${asset}USDC`);
}

function canBuyAsset(asset: string): boolean {
  return Boolean(asset) && !STABLES.has(asset.toUpperCase());
}

export function PortfolioAiPanel({
  advice,
  adviceAt,
  portfolioTotalUsdc = 0,
  onGenerated,
  onTradeSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [buyModal, setBuyModal] = useState<BuyModalState | null>(null);

  const { data: piata } = useSWR<PiataData>(
    advice ? "/api/market/piata" : null,
    piataFetcher,
    { revalidateOnFocus: false }
  );
  const catalog = piata?.catalog ?? [];

  async function generate() {
    setLoading(true);
    toast.loading("AI analizează portofoliul…", { id: "portfolio-ai" });
    try {
      const r = await fetch("/api/portfolio/ai", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success("Recomandări AI generate", { id: "portfolio-ai" });
      onGenerated();
    } catch (e: any) {
      toast.error(e.message || "Eroare AI", { id: "portfolio-ai" });
    } finally {
      setLoading(false);
    }
  }

  function openBuy(asset: string, usdc: number | undefined, label: string) {
    if (!canBuyAsset(asset)) return;
    const row = findPiataRow(catalog, asset);
    setBuyModal({
      pair: row?.symbol ?? `${asset}USDC`,
      price: row?.price,
      usdc: usdc && usdc >= 10 ? usdc : undefined,
      asset,
      label,
    });
  }

  return (
    <>
      <Card className="border-secondary/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-secondary">
            <Brain className="h-4 w-4" />
            Recomandări AI
          </CardTitle>
          <button type="button" className="btn-primary text-xs" disabled={loading} onClick={generate}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analiză…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generează recomandări
              </>
            )}
          </button>
        </CardHeader>

        {!advice ? (
          <p className="text-sm text-text-muted">
            Apasă butonul pentru analiză AI: rebalansări sugerate, idei de investiții long-term și note de risc —
            bazat pe alocarea ta și datele Binance.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("chip text-[10px] uppercase", urgencyStyle[advice.rebalanceUrgency])}>
                Urgență: {advice.rebalanceUrgency}
              </span>
              {adviceAt && (
                <span className="text-[10px] mono text-text-muted">
                  {new Date(adviceAt).toLocaleString("ro-RO", { hour12: false })}
                </span>
              )}
              {advice.model && (
                <span className="text-[10px] mono text-text-muted">
                  {advice.provider} · {advice.model}
                </span>
              )}
            </div>

            <p className="text-sm text-text-primary leading-relaxed">{advice.summary}</p>

            {advice.recommendations.length > 0 && (
              <div>
                <h4 className="text-[10px] mono uppercase tracking-widest text-text-muted mb-2">Rebalansare</h4>
                <ul className="space-y-2">
                  {advice.recommendations.map((r, i) => (
                    <li key={i} className="rounded-lg border border-border/50 bg-surface-2/30 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="font-mono font-medium">{r.asset}</span>
                          <span
                            className={cn(
                              "text-[10px] mono uppercase px-1.5 py-0.5 rounded border",
                              r.action === "BUY"
                                ? "border-success/40 text-success"
                                : r.action === "SELL"
                                  ? "border-danger/40 text-danger"
                                  : "border-border text-text-muted"
                            )}
                          >
                            {r.action}
                          </span>
                          {r.suggestedUsdc != null && r.suggestedUsdc > 0 && (
                            <span className="text-xs mono text-text-muted">~{fmtUsd(r.suggestedUsdc)}</span>
                          )}
                        </div>
                        {r.action === "BUY" && canBuyAsset(r.asset) && (
                          <button
                            type="button"
                            className="btn-primary text-xs py-1 px-2.5 shrink-0"
                            onClick={() =>
                              openBuy(r.asset, r.suggestedUsdc, `AI rebalansare · ${r.asset}`)
                            }
                          >
                            <ShoppingCart className="h-3.5 w-3.5" />
                            BUY
                          </button>
                        )}
                        {r.action === "SELL" && (
                          <a href="/positions" className="btn text-xs py-1 px-2.5 shrink-0">
                            Positions
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-1">{r.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {advice.investmentIdeas.length > 0 && (
              <div>
                <h4 className="text-[10px] mono uppercase tracking-widest text-text-muted mb-2">
                  Idei investiții long-term
                </h4>
                <ul className="space-y-2">
                  {advice.investmentIdeas.map((r, i) => {
                    const allocUsdc =
                      r.suggestedAllocationPct != null && portfolioTotalUsdc > 0
                        ? (r.suggestedAllocationPct / 100) * portfolioTotalUsdc
                        : undefined;
                    const showBuy = r.action === "CONSIDER_BUY" && canBuyAsset(r.asset);
                    return (
                      <li
                        key={i}
                        className="rounded-lg border border-secondary/20 bg-secondary/5 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="font-mono font-medium text-secondary">{r.asset}</span>
                            <span className="text-[10px] mono uppercase text-text-muted">
                              {r.action.replace("_", " ")}
                            </span>
                            {r.suggestedAllocationPct != null && (
                              <span className="text-xs mono">~{r.suggestedAllocationPct}%</span>
                            )}
                            {allocUsdc != null && allocUsdc >= 10 && (
                              <span className="text-xs mono text-text-muted">≈ {fmtUsd(allocUsdc)}</span>
                            )}
                            {r.horizon && <span className="text-xs text-text-muted">· {r.horizon}</span>}
                          </div>
                          {showBuy && (
                            <button
                              type="button"
                              className="btn-primary text-xs py-1 px-2.5 shrink-0"
                              onClick={() =>
                                openBuy(r.asset, allocUsdc, `AI investiție LT · ${r.asset}`)
                              }
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                              BUY
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-text-muted mt-1">{r.reason}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {advice.riskNotes.length > 0 && (
              <div className="text-xs text-text-muted border-t border-border/50 pt-3 space-y-1">
                {advice.riskNotes.map((n, i) => (
                  <p key={i}>• {n}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <ManualTradeModal
        open={buyModal != null}
        onOpenChange={(open) => {
          if (!open) setBuyModal(null);
        }}
        pair={buyModal?.pair ?? ""}
        price={buyModal?.price}
        initialUsdc={buyModal?.usdc}
        defaultWithSlTp={false}
        source="portfolio-ai"
        reasoning={buyModal?.label ?? "Recomandare AI portofoliu"}
        onSuccess={() => {
          setBuyModal(null);
          onTradeSuccess?.();
        }}
      />
    </>
  );
}
