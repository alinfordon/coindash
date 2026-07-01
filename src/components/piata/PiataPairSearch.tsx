"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { MarketPairTable } from "@/components/piata/MarketPairTable";
import { filterPiataByQuery, type PiataRow } from "@/lib/marketPiata";

type Props = {
  catalog: PiataRow[];
  onBuy: (row: PiataRow) => void;
  onSearchActiveChange?: (active: boolean) => void;
  searchPlaceholder?: string;
  catalogHint?: string;
  volumeLabel?: string;
};

export function PiataPairSearch({
  catalog,
  onBuy,
  onSearchActiveChange,
  searchPlaceholder = "Caută pereche SPOT USDC (ex. BTC, SOL, ETHUSDC…)",
  catalogHint,
  volumeLabel = "Vol USDC",
}: Props) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => filterPiataByQuery(catalog, query), [catalog, query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    onSearchActiveChange?.(searching);
  }, [searching, onSearchActiveChange]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-border/70 bg-surface-2/50 pl-10 pr-10 py-2.5 text-sm mono text-text-primary placeholder:text-text-muted/70 focus:outline-none focus:border-primary/50"
          aria-label={searchPlaceholder}
        />
        {query && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2/80 transition-colors"
            onClick={() => setQuery("")}
            aria-label="Șterge căutarea"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!searching && catalog.length > 0 && (
        <p className="text-[10px] mono text-text-muted">
          {catalogHint ?? `${catalog.length} perechi · sortate după volum 24h`}
        </p>
      )}

      {searching && (
        <MarketPairTable
          title="Rezultate căutare"
          subtitle={
            results.length > 0
              ? `${results.length} potrivire${results.length === 1 ? "" : "i"} pentru „${query.trim()}”`
              : `Nicio potrivire pentru „${query.trim()}”`
          }
          icon={Search}
          accent="primary"
          rows={results}
          emptyLabel="Nicio pereche găsită. Încearcă ticker-ul sau perechea completă."
          volumeLabel={volumeLabel}
          onBuy={onBuy}
        />
      )}
    </div>
  );
}
