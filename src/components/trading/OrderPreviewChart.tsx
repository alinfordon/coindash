"use client";

import { useEffect, useRef, useState } from "react";
import { fmtUsd } from "@/lib/utils";
import { guessKrakenAssetClass } from "@/lib/krakenWs";
import { Loader2 } from "lucide-react";

type Interval = "15m" | "1h" | "4h";

type Props = {
  symbol: string;
  testnet?: boolean;
  exchange?: "binance" | "kraken";
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  withSlTp?: boolean;
  height?: number;
};

const INTERVALS: Interval[] = ["15m", "1h", "4h"];

export function OrderPreviewChart({
  symbol,
  testnet = false,
  exchange = "binance",
  entryPrice,
  stopLoss,
  takeProfit,
  withSlTp = true,
  height = 220,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const lastCloseRef = useRef<number | null>(null);

  const [interval, setInterval] = useState<Interval>("1h");
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [lastClose, setLastClose] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let resizeHandler: (() => void) | null = null;

    async function init() {
      if (!containerRef.current || !symbol) return;
      setStatus("loading");
      setLastClose(null);
      lastCloseRef.current = null;

      const { createChart, ColorType } = await import("lightweight-charts");
      if (cancelled || !containerRef.current) return;

      containerRef.current.innerHTML = "";
      priceLinesRef.current = [];

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: "rgba(0,0,0,0)" },
          textColor: "#5A7A9A",
          fontFamily: "JetBrains Mono",
          fontSize: 11,
        },
        grid: {
          horzLines: { color: "rgba(26,42,58,0.4)" },
          vertLines: { color: "rgba(26,42,58,0.25)" },
        },
        timeScale: { borderColor: "#1A2A3A", timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: "#1A2A3A" },
      });
      chartRef.current = chart;

      const series = chart.addCandlestickSeries({
        upColor: "#00FF88",
        downColor: "#FF3366",
        borderUpColor: "#00FF88",
        borderDownColor: "#FF3366",
        wickUpColor: "#00FF88",
        wickDownColor: "#FF3366",
      });
      seriesRef.current = series;

      try {
        const assetClass = exchange === "kraken" ? guessKrakenAssetClass(symbol) : "crypto";
        const qs = new URLSearchParams({ pair: symbol, interval, limit: "120", assetClass });
        const r = await fetch(`/api/market/candles?${qs}`);
        if (!r.ok) throw new Error(`klines ${r.status}`);
        const payload = await r.json();
        if (!payload.ok || !Array.isArray(payload.candles) || payload.candles.length === 0) {
          throw new Error("no candles");
        }
        const d = payload.candles as {
          openTime: number;
          open: number;
          high: number;
          low: number;
          close: number;
        }[];

        const data = d.map((c) => ({
          time: Math.floor(Number(c.openTime) / 1000) as any,
          open: +c.open,
          high: +c.high,
          low: +c.low,
          close: +c.close,
        }));
        const close = data[data.length - 1]?.close ?? null;
        lastCloseRef.current = close;
        setLastClose(close);
        series.setData(data);
        chart.timeScale().fitContent();
        if (!cancelled) setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
      }

      resizeHandler = () => {
        if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
      };
      window.addEventListener("resize", resizeHandler);
    }

    init();
    return () => {
      cancelled = true;
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      chartRef.current?.remove?.();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, [symbol, testnet, exchange, interval, height]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        /* ignore */
      }
    }
    priceLinesRef.current = [];

    const entry = entryPrice && entryPrice > 0 ? entryPrice : lastCloseRef.current;
    if (entry && entry > 0) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: entry,
          color: "#00F5FF",
          lineWidth: 2,
          lineStyle: 2, // LineStyle.Dashed
          axisLabelVisible: true,
          title: "INTRARE",
        })
      );
    }

    if (withSlTp && stopLoss && stopLoss > 0) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: stopLoss,
          color: "#FF3366",
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: "SL",
        })
      );
    }

    if (withSlTp && takeProfit && takeProfit > 0) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: takeProfit,
          color: "#00FF88",
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: "TP",
        })
      );
    }
  }, [entryPrice, stopLoss, takeProfit, withSlTp, status]);

  const entryLabel =
    entryPrice && entryPrice > 0 ? entryPrice : lastClose && status === "ok" ? lastClose : null;

  return (
    <div className="rounded-lg border border-border/60 bg-surface-2/20 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40">
        <span className="text-[10px] mono uppercase tracking-widest text-text-muted">Grafic lumânări</span>
        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              className={`px-2 py-0.5 rounded text-[10px] mono transition-colors ${
                interval === iv
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-text-muted hover:text-text-primary border border-transparent"
              }`}
              onClick={() => setInterval(iv)}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      <div className="relative px-1 pb-1">
        {status === "loading" && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-[10px] mono text-text-muted bg-surface/50"
            style={{ minHeight: height }}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Se încarcă lumânările…
          </div>
        )}
        {status === "error" && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center text-[10px] mono text-danger/90 bg-surface/60 px-3 text-center"
            style={{ minHeight: height }}
          >
            Grafic indisponibil ({exchange === "kraken" ? "Kraken" : testnet ? "testnet" : "live"} · {symbol})
          </div>
        )}
        <div ref={containerRef} className="w-full" style={{ minHeight: height }} />
      </div>

      {status === "ok" && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 border-t border-border/40 text-[10px] mono">
          <span className="text-primary">
            ● Intrare {entryLabel != null ? fmtUsd(entryLabel, 4) : "—"}
          </span>
          {withSlTp && stopLoss != null && stopLoss > 0 && (
            <span className="text-danger">● SL {fmtUsd(stopLoss, 4)}</span>
          )}
          {withSlTp && takeProfit != null && takeProfit > 0 && (
            <span className="text-success">● TP {fmtUsd(takeProfit, 4)}</span>
          )}
        </div>
      )}
    </div>
  );
}
