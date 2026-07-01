"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn, fmtUsd } from "@/lib/utils";
import type { RebalanceAction } from "@/lib/investPortfolioTypes";
import type { PiataRow } from "@/lib/marketPiata";
import { ManualTradeModal } from "@/components/analysis/AnalysisBuyModal";
import { PiataPairSearch } from "@/components/piata/PiataPairSearch";
import { ArrowDownRight, ArrowUpRight, Loader2, Scale, ShoppingCart } from "lucide-react";

const STABLES = new Set(["USDC", "USDT", "BUSD", "FDUSD", "TUSD", "DAI", "USDP", "PYUSD"]);

type BuyModalState = {
  pair: string;
  price?: number;
  usdc?: number;
  asset: string;
};

type PiataData = {
  catalog?: PiataRow[];
};

const piataFetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

function findPiataRow(catalog: PiataRow[], asset: string): PiataRow | undefined {
  return catalog.find((r) => r.base === asset || r.symbol === `${asset}USDC`);
}

export function RebalancePlanCard({
  plan,
  threshold,
  needsRebalance,
  onTradeSuccess,
}: {
  plan: RebalanceAction[];
  threshold: number;
  needsRebalance: boolean;
  onTradeSuccess?: () => void;
}) {
  const { data: piata, isLoading: piataLoading } = useSWR<PiataData>(
    "/api/market/piata",
    piataFetcher,
    { revalidateOnFocus: false }
  );
  const catalog = piata?.catalog ?? [];

  const [buyModal, setBuyModal] = useState<BuyModalState | null>(null);

  function openBuyFromAction(action: RebalanceAction) {
    const row = findPiataRow(catalog, action.asset);
    setBuyModal({
      pair: row?.symbol ?? `${action.asset}USDC`,
      price: row?.price,
      usdc: action.suggestedUsdc,
      asset: action.asset,
    });
  }

  function openBuyFromMarket(row: PiataRow) {
    setBuyModal({
      pair: row.symbol,
      price: row.price,
      asset: row.base,
    });
  }

  return (
    <>
      <Card className={cn("min-w-0 overflow-hidden p-4 sm:p-5", needsRebalance ? "border-warning/30" : "")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Plan rebalansare
          </CardTitle>
        </CardHeader>

        {!needsRebalance ? (
          <p className="text-sm text-text-muted">
            Portofoliul este echilibrat în limitele pragului de {threshold}%. Nicio acțiune necesară acum.
          </p>
        ) : (
          <ul className="space-y-2">
            {plan.map((a) => {
              const canBuy = a.action === "BUY" && !STABLES.has(a.asset);
              return (
                <li
                  key={`${a.asset}-${a.action}`}
                  className="rounded-lg border border-border/60 bg-surface-2/40 px-3 py-3 text-sm space-y-2.5"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {a.action === "BUY" ? (
                      <ArrowUpRight className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium mono break-words">
                        {a.action} {a.asset}
                        <span className="text-text-muted font-normal ml-1 sm:ml-2 block sm:inline mt-0.5 sm:mt-0">
                          ~{fmtUsd(a.suggestedUsdc)}
                        </span>
                      </div>
                      <div className="text-xs text-text-muted mt-1 leading-relaxed">{a.reason}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pl-6 sm:pl-0 sm:ml-6">
                    <div className="text-[10px] mono uppercase tracking-widest text-text-muted break-words">
                      {a.currentWeightPct.toFixed(1)}% → {a.targetWeightPct.toFixed(1)}%
                      <span className={cn("ml-1 sm:ml-2", a.driftPct > 0 ? "text-success" : "text-danger")}>
                        ({a.driftPct > 0 ? "+" : ""}
                        {a.driftPct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {canBuy && (
                        <button
                          type="button"
                          className="btn-primary text-xs py-1.5 px-3 w-full sm:w-auto justify-center"
                          onClick={() => openBuyFromAction(a)}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          BUY
                        </button>
                      )}
                      {a.action === "SELL" && (
                        <a href="/positions" className="btn text-xs py-1.5 px-3 w-full sm:w-auto justify-center">
                          Positions
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 pt-4 border-t border-border/60 space-y-3">
          <div>
            <h4 className="text-[10px] mono uppercase tracking-widest text-text-muted">Caută în Market</h4>
            <p className="text-xs text-text-muted mt-1">
              Perechi SPOT USDC — deschide BUY manual pentru orice activ din catalog.
            </p>
          </div>
          {piataLoading && !catalog.length ? (
            <p className="text-xs text-text-muted flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Se încarcă catalogul…
            </p>
          ) : (
            <PiataPairSearch catalog={catalog} onBuy={openBuyFromMarket} />
          )}
        </div>

        <p className="text-[10px] text-text-muted mt-3 leading-relaxed">
          BUY deschide modalul de ordin (suma sugerată precompletată la rebalansare). Long-term: SL/TP dezactivat
          implicit. Nu include taxe sau slippage.
        </p>
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
        source="portfolio-rebalance"
        reasoning={
          buyModal?.usdc
            ? `Rebalansare portofoliu · ~$${buyModal.usdc.toFixed(2)} ${buyModal.asset}`
            : `Rebalansare portofoliu · ${buyModal?.asset ?? ""}`
        }
        onSuccess={() => {
          setBuyModal(null);
          onTradeSuccess?.();
        }}
      />
    </>
  );
}
