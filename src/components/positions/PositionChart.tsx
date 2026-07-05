"use client";

import { useMemo, useState } from "react";
import { MiniCandles, type ChartPriceLine } from "@/components/analysis/MiniChart";
import { classOfPnl, fmtNum, fmtPct } from "@/lib/utils";
import type { AnalysisIndicatorsConfig } from "@/lib/analysisIndicators";

const POSITION_INDICATORS: AnalysisIndicatorsConfig = {
  rsi: false,
  macd: false,
  ema: true,
  bollinger: true,
  fibonacci: false,
  elliottWave: false,
};

type Props = {
  symbol: string;
  exchange?: "binance" | "kraken";
  assetClass?: "crypto" | "tokenized_asset";
  testnet?: boolean;
  entryPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  quantity?: number;
  entryFee?: number | null;
  feeCurrency?: string | null;
};

function isValidPrice(p: unknown): p is number {
  return typeof p === "number" && Number.isFinite(p) && p > 0;
}

function formatFee(fee: number | null | undefined, currency: string | null | undefined): string {
  if (fee == null || !Number.isFinite(fee) || fee <= 0) return "—";
  const cur = currency || "USD";
  if (cur === "USD" || cur === "USDC" || cur === "USDT") return `$${fee.toFixed(4)}`;
  return `${fee.toFixed(6)} ${cur}`;
}

export function PositionChart({
  symbol,
  exchange = "binance",
  assetClass = "crypto",
  testnet = false,
  entryPrice,
  stopLoss,
  takeProfit,
  quantity,
  entryFee,
  feeCurrency,
}: Props) {
  const [livePrice, setLivePrice] = useState<number | null>(null);

  const priceLines = useMemo((): ChartPriceLine[] => {
    const lines: ChartPriceLine[] = [];
    if (isValidPrice(entryPrice)) {
      lines.push({ price: entryPrice, color: "#00F5FF", title: "ENTRY", dashed: true });
    }
    if (isValidPrice(stopLoss)) {
      lines.push({ price: stopLoss, color: "#FF3366", title: "SL" });
    }
    if (isValidPrice(takeProfit)) {
      lines.push({ price: takeProfit, color: "#00FF88", title: "TP" });
    }
    return lines;
  }, [entryPrice, stopLoss, takeProfit]);

  const pnlPct = livePrice ? ((livePrice - entryPrice) / entryPrice) * 100 : 0;
  const pnlUsdc = livePrice && quantity ? (livePrice - entryPrice) * quantity : 0;

  const distToSL =
    livePrice && isValidPrice(stopLoss) ? ((livePrice - stopLoss) / livePrice) * 100 : null;
  const distToTP =
    livePrice && isValidPrice(takeProfit) ? ((takeProfit - livePrice) / livePrice) * 100 : null;

  const hasSlTp = isValidPrice(stopLoss) && isValidPrice(takeProfit);

  return (
    <div className="space-y-3">
      <MiniCandles
        symbol={symbol}
        exchange={exchange}
        assetClass={assetClass}
        testnet={testnet}
        interval="15m"
        showIntervalPicker
        indicators={POSITION_INDICATORS}
        priceLines={priceLines}
        onLivePrice={setLivePrice}
        title={symbol}
      />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] mono text-text-muted">
        <LegendSwatch color="#00F5FF" label="Entry (dashed)" />
        {isValidPrice(stopLoss) && <LegendSwatch color="#FF3366" label="Stop Loss" />}
        {isValidPrice(takeProfit) && <LegendSwatch color="#00FF88" label="Take Profit" />}
        {!hasSlTp && <span className="text-text-muted/80 italic">Fără SL/TP pe poziție</span>}
        {livePrice != null && (
          <span className={`chip text-[10px] ${classOfPnl(pnlPct)} border-current/30`}>
            P&L live {fmtPct(pnlPct)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <MiniStat label="Entry" value={fmtNum(entryPrice, 6)} />
        <MiniStat
          label="Stop Loss"
          value={isValidPrice(stopLoss) ? fmtNum(stopLoss, 6) : "—"}
          sub={
            distToSL != null ? (
              <span className="text-danger">{fmtPct(-Math.abs(distToSL))}</span>
            ) : undefined
          }
        />
        <MiniStat
          label="Take Profit"
          value={isValidPrice(takeProfit) ? fmtNum(takeProfit, 6) : "—"}
          sub={
            distToTP != null ? (
              <span className="text-success">+{fmtPct(distToTP).replace("+", "")}</span>
            ) : undefined
          }
        />
        <MiniStat
          label="Entry fee"
          value={formatFee(entryFee, feeCurrency)}
          sub={feeCurrency ? <span className="text-text-muted">{feeCurrency}</span> : undefined}
        />
        <MiniStat
          label={quantity ? "Unrealized P&L" : "Live"}
          value={quantity ? `${pnlUsdc >= 0 ? "+" : ""}${pnlUsdc.toFixed(4)}` : fmtNum(livePrice ?? 0, 6)}
          sub={quantity ? <span className={classOfPnl(pnlPct)}>{fmtPct(pnlPct)}</span> : undefined}
          valueClass={quantity ? classOfPnl(pnlUsdc) : ""}
        />
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-[3px] w-4 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {label}
    </span>
  );
}

function MiniStat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/40 px-3 py-2">
      <div className="text-[10px] mono uppercase tracking-widest text-text-muted">{label}</div>
      <div className={`mono font-semibold ${valueClass || "text-text-primary"}`}>{value}</div>
      {sub && <div className="text-[10px] mono">{sub}</div>}
    </div>
  );
}
