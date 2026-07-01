"use client";

import type { LucideIcon } from "lucide-react";
import { ShoppingCart } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";
import { formatQuoteVolume, type PiataRow } from "@/lib/marketPiata";

type Props = {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  accent?: "primary" | "success" | "danger" | "secondary";
  rows: PiataRow[];
  emptyLabel?: string;
  volumeLabel?: string;
  onBuy: (row: PiataRow) => void;
};

export function MarketPairTable({
  title,
  subtitle,
  icon: Icon,
  accent = "primary",
  rows,
  emptyLabel,
  volumeLabel = "Vol USDC",
  onBuy,
}: Props) {
  const accentBorder =
    accent === "success"
      ? "border-success/30"
      : accent === "danger"
        ? "border-danger/30"
        : accent === "secondary"
          ? "border-secondary/30"
          : "border-primary/30";

  return (
    <Card className={`border-l-2 ${accentBorder}`}>
      <CardHeader className="mb-3">
        <div>
          <CardTitle className="flex items-center gap-2 normal-case tracking-normal text-text-primary">
            <Icon className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
          {subtitle && <p className="text-[10px] mono text-text-muted mt-1">{subtitle}</p>}
        </div>
      </CardHeader>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel ?? "Nicio pereche în această categorie."}</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] mono uppercase tracking-widest text-text-muted border-b border-border/50">
                <th className="text-left py-2 px-1 font-normal">#</th>
                <th className="text-left py-2 px-1 font-normal">Pereche</th>
                <th className="text-right py-2 px-1 font-normal">Preț</th>
                <th className="text-right py-2 px-1 font-normal">24h</th>
                <th className="text-right py-2 px-1 font-normal hidden sm:table-cell">{volumeLabel}</th>
                <th className="text-right py-2 px-1 font-normal w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.symbol} className="border-b border-border/30 hover:bg-surface-2/40 transition-colors">
                  <td className="py-2.5 px-1 mono text-text-muted">{i + 1}</td>
                  <td className="py-2.5 px-1">
                    <div className="font-semibold text-text-primary">{row.base}</div>
                    <div className="text-[10px] mono text-text-muted">{row.symbol}</div>
                  </td>
                  <td className="py-2.5 px-1 text-right mono">{fmtUsd(row.price, 4)}</td>
                  <td className={`py-2.5 px-1 text-right mono font-medium ${classOfPnl(row.change24h)}`}>
                    {fmtPct(row.change24h)}
                  </td>
                  <td className="py-2.5 px-1 text-right mono text-text-muted hidden sm:table-cell">
                    {formatQuoteVolume(row.quoteVolume24h)}
                  </td>
                  <td className="py-2.5 px-1 text-right">
                    <button
                      type="button"
                      className="chip border-success/50 text-success hover:bg-success/10 transition-colors text-[10px]"
                      onClick={() => onBuy(row)}
                    >
                      <ShoppingCart className="h-3 w-3" /> BUY
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
