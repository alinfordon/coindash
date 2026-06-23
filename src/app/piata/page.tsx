"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/Card";
import { MarketPairTable } from "@/components/piata/MarketPairTable";
import { PiataPairSearch } from "@/components/piata/PiataPairSearch";
import { ManualTradeModal } from "@/components/analysis/AnalysisBuyModal";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";
import type { PiataRow } from "@/lib/marketPiata";
import {
  Flame,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

type PiataData = {
  ok?: boolean;
  testnet?: boolean;
  updatedAt?: string;
  fetchError?: string | null;
  btc?: { price: number; change24h: number; quoteVolume24h: number } | null;
  trending: PiataRow[];
  hot: PiataRow[];
  rising24h: PiataRow[];
  falling24h: PiataRow[];
  catalog?: PiataRow[];
  catalogCount?: number;
};

export default function PiataPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<PiataData>("/api/market/piata", fetcher, {
    refreshInterval: 60_000,
  });
  const [buyTarget, setBuyTarget] = useState<PiataRow | null>(null);
  const [searchActive, setSearchActive] = useState(false);

  const updatedLabel = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString("ro-RO", { hour12: false })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold">Market</h1>
          <p className="text-sm text-text-muted mt-1 mono">
            Doar perechi SPOT tranzacționabile USDC pe Binance · trading manual (fără AI)
            {data?.testnet != null && <> · {data.testnet ? "TESTNET" : "LIVE"}</>}
          </p>
          {updatedLabel && (
            <p className="text-[10px] mono text-text-muted mt-1">Actualizat: {updatedLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(isLoading || isValidating) && (
            <span className="chip border-border text-text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Sync…
            </span>
          )}
          <button type="button" className="btn" onClick={() => mutate()}>
            <RefreshCw className="h-4 w-4" /> Reîmprospătează
          </button>
        </div>
      </div>

      {error && (
        <Card className="border-danger/40 bg-danger/5 text-danger text-sm">
          Nu s-au putut încărca datele pieței — {error.message}
        </Card>
      )}

      {data?.fetchError && (
        <Card className="border-warning/40 bg-warning/5 text-warning text-sm">{data.fetchError}</Card>
      )}

      {data?.btc && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[10px] mono uppercase text-text-muted">BTC / USDC</div>
              <div className="mono text-2xl font-semibold">{fmtUsd(data.btc.price)}</div>
            </div>
            <div>
              <div className="text-[10px] mono uppercase text-text-muted">24h</div>
              <div className={`mono text-lg ${classOfPnl(data.btc.change24h)}`}>{fmtPct(data.btc.change24h)}</div>
            </div>
          </div>
        </Card>
      )}

      <PiataPairSearch
        catalog={data?.catalog ?? []}
        onBuy={setBuyTarget}
        onSearchActiveChange={setSearchActive}
      />

      {!searchActive && (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <MarketPairTable
          title="În tendință"
          subtitle="Top volum USDC 24h — SPOT tranzacționabile"
          icon={Zap}
          accent="primary"
          rows={data?.trending ?? []}
          onBuy={setBuyTarget}
        />
        <MarketPairTable
          title="Proiecte căutate"
          subtitle="Volum × momentum — atenție ridicată pe piață"
          icon={Flame}
          accent="secondary"
          rows={data?.hot ?? []}
          onBuy={setBuyTarget}
        />
        <MarketPairTable
          title="În creșere 24h"
          subtitle="Cele mai mari creșteri procentuale"
          icon={TrendingUp}
          accent="success"
          rows={data?.rising24h ?? []}
          onBuy={setBuyTarget}
        />
        <MarketPairTable
          title="În scădere 24h"
          subtitle="Cele mai mari scăderi procentuale"
          icon={TrendingDown}
          accent="danger"
          rows={data?.falling24h ?? []}
          onBuy={setBuyTarget}
        />
      </div>
      )}

      <ManualTradeModal
        open={buyTarget != null}
        onOpenChange={(open) => {
          if (!open) setBuyTarget(null);
        }}
        pair={buyTarget?.symbol ?? ""}
        price={buyTarget?.price}
        source="Market"
      />
    </div>
  );
}
