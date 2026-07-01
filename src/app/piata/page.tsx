"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/Card";
import { MarketPairTable } from "@/components/piata/MarketPairTable";
import { PiataPairSearch } from "@/components/piata/PiataPairSearch";
import { ManualTradeModal } from "@/components/analysis/AnalysisBuyModal";
import { cn, classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";
import type { PiataMarketSections, PiataRow } from "@/lib/marketPiata";
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

type PiataTab = "crypto" | "xstocks";

type PiataData = {
  ok?: boolean;
  exchange?: "binance" | "kraken";
  testnet?: boolean;
  krakenMarkets?: "crypto" | "stocks" | "both" | null;
  updatedAt?: string;
  fetchError?: string | null;
  markets?: {
    crypto?: PiataMarketSections;
    xstocks?: PiataMarketSections;
    default?: PiataMarketSections;
  };
  trending?: PiataRow[];
  hot?: PiataRow[];
  rising24h?: PiataRow[];
  falling24h?: PiataRow[];
  catalog?: PiataRow[];
  catalogCount?: number;
  btc?: { price: number; change24h: number; quoteVolume24h: number } | null;
};

function resolveMarket(data: PiataData | undefined, tab: PiataTab): PiataMarketSections {
  const empty: PiataMarketSections = {
    trending: [],
    hot: [],
    rising24h: [],
    falling24h: [],
    catalog: [],
    catalogCount: 0,
    btc: null,
  };
  if (!data) return empty;

  if (data.exchange === "kraken") {
    if (tab === "xstocks") return data.markets?.xstocks ?? empty;
    return data.markets?.crypto ?? empty;
  }

  const m = data.markets?.default;
  if (m) return m;
  return {
    trending: data.trending ?? [],
    hot: data.hot ?? [],
    rising24h: data.rising24h ?? [],
    falling24h: data.falling24h ?? [],
    catalog: data.catalog ?? [],
    catalogCount: data.catalogCount ?? 0,
    btc: data.btc ?? null,
  };
}

function exchangeSubtitle(data: PiataData | undefined): string {
  if (!data) return "Perechi spot de pe exchange-ul activ";
  if (data.exchange === "kraken") {
    return "Kraken · crypto spot + xStocks · trading manual";
  }
  return `Binance · perechi SPOT USDC tranzacționabile · ${data.testnet ? "TESTNET" : "LIVE"}`;
}

function PiataSectionsGrid({
  market,
  volumeLabel,
  onBuy,
}: {
  market: PiataMarketSections;
  volumeLabel: string;
  onBuy: (row: PiataRow) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <MarketPairTable
        title="În tendință"
        subtitle={`Top volum 24h · ${volumeLabel}`}
        icon={Zap}
        accent="primary"
        rows={market.trending}
        volumeLabel={volumeLabel}
        onBuy={onBuy}
      />
      <MarketPairTable
        title="Proiecte căutate"
        subtitle="Volum × momentum — atenție ridicată pe piață"
        icon={Flame}
        accent="secondary"
        rows={market.hot}
        volumeLabel={volumeLabel}
        onBuy={onBuy}
      />
      <MarketPairTable
        title="În creștere 24h"
        subtitle="Cele mai mari creșteri procentuale"
        icon={TrendingUp}
        accent="success"
        rows={market.rising24h}
        volumeLabel={volumeLabel}
        onBuy={onBuy}
      />
      <MarketPairTable
        title="În scădere 24h"
        subtitle="Cele mai mari scăderi procentuale"
        icon={TrendingDown}
        accent="danger"
        rows={market.falling24h}
        volumeLabel={volumeLabel}
        onBuy={onBuy}
      />
    </div>
  );
}

export default function PiataPage() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<PiataData>("/api/market/piata", fetcher, {
    refreshInterval: 60_000,
  });

  const showKrakenTabs =
    data?.exchange === "kraken" &&
    data.krakenMarkets === "both" &&
    !!data.markets?.crypto &&
    !!data.markets?.xstocks;

  const defaultTab: PiataTab =
    data?.exchange === "kraken" && data.krakenMarkets === "stocks" ? "xstocks" : "crypto";

  const [tab, setTab] = useState<PiataTab>(defaultTab);
  const [buyTarget, setBuyTarget] = useState<PiataRow | null>(null);
  const [searchActive, setSearchActive] = useState(false);

  const activeTab = useMemo(() => {
    if (data?.exchange === "kraken" && data.krakenMarkets === "stocks") return "xstocks" as const;
    if (data?.exchange === "kraken" && data.krakenMarkets === "crypto") return "crypto" as const;
    return tab;
  }, [data?.exchange, data?.krakenMarkets, tab]);

  const market = useMemo(() => resolveMarket(data, activeTab), [data, activeTab]);

  const volumeLabel = activeTab === "xstocks" ? "Vol USD" : data?.exchange === "kraken" ? "Vol USD" : "Vol USDC";
  const searchPlaceholder =
    activeTab === "xstocks"
      ? "Caută xStock (ex. AAPL, TSLA, AAPLxUSD…)"
      : data?.exchange === "kraken"
        ? "Caută pereche crypto (ex. BTC, SOL, ETHUSD…)"
        : "Caută pereche SPOT USDC (ex. BTC, SOL, ETHUSDC…)";

  const catalogHint =
    activeTab === "xstocks"
      ? `${market.catalogCount} xStocks tranzacționabile · sortate după volum 24h`
      : data?.exchange === "kraken"
        ? `${market.catalogCount} perechi crypto Kraken · sortate după volum 24h`
        : `${market.catalogCount} perechi SPOT USDC tranzacționabile · sortate după volum 24h`;

  const updatedLabel = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString("ro-RO", { hour12: false })
    : null;

  const btcLabel =
    data?.exchange === "kraken"
      ? market.btc ? "BTC / USD" : null
      : market.btc ? "BTC / USDC" : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold">Market</h1>
          <p className="text-sm text-text-muted mt-1 mono">{exchangeSubtitle(data)}</p>
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

      {showKrakenTabs && (
        <div className="flex gap-2 border-b border-border/50 pb-1">
          {(
            [
              { id: "crypto" as const, label: "Crypto" },
              { id: "xstocks" as const, label: "xStocks" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={cn(
                "px-4 py-2 text-sm mono rounded-t-lg border-b-2 transition-colors -mb-px",
                activeTab === id
                  ? "border-primary text-primary bg-primary/10"
                  : "border-transparent text-text-muted hover:text-text-primary"
              )}
              onClick={() => setTab(id)}
            >
              {label}
              <span className="ml-2 text-[10px] opacity-70">
                {id === "crypto"
                  ? data?.markets?.crypto?.catalogCount ?? 0
                  : data?.markets?.xstocks?.catalogCount ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <Card className="border-danger/40 bg-danger/5 text-danger text-sm">
          Nu s-au putut încărca datele pieței — {error.message}
        </Card>
      )}

      {data?.fetchError && (
        <Card className="border-warning/40 bg-warning/5 text-warning text-sm">{data.fetchError}</Card>
      )}

      {market.btc && btcLabel && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-[10px] mono uppercase text-text-muted">{btcLabel}</div>
              <div className="mono text-2xl font-semibold">{fmtUsd(market.btc.price)}</div>
            </div>
            <div>
              <div className="text-[10px] mono uppercase text-text-muted">24h</div>
              <div className={`mono text-lg ${classOfPnl(market.btc.change24h)}`}>
                {fmtPct(market.btc.change24h)}
              </div>
            </div>
          </div>
        </Card>
      )}

      <PiataPairSearch
        catalog={market.catalog}
        onBuy={setBuyTarget}
        onSearchActiveChange={setSearchActive}
        searchPlaceholder={searchPlaceholder}
        catalogHint={catalogHint}
        volumeLabel={volumeLabel}
      />

      {!searchActive && (
        <PiataSectionsGrid market={market} volumeLabel={volumeLabel} onBuy={setBuyTarget} />
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
