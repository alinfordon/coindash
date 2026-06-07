"use client";

import { useEffect, useRef, useState } from "react";
import { baseUrl } from "@/lib/binance";

type Props = {
  symbol: string;
  testnet?: boolean;
  /** Candle interval for the chart (should match analysis trend TF when possible). */
  interval?: string;
};

export function MiniCandles({ symbol, testnet = false, interval = "1h" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let resizeHandler: (() => void) | null = null;

    async function init() {
      if (!ref.current) return;
      setStatus("loading");
      const { createChart, ColorType } = await import("lightweight-charts");
      if (cancelled) return;
      ref.current.innerHTML = "";
      const chart = createChart(ref.current, {
        width: ref.current.clientWidth,
        height: 220,
        layout: {
          background: { type: ColorType.Solid, color: "rgba(0,0,0,0)" },
          textColor: "#5A7A9A",
          fontFamily: "JetBrains Mono",
        },
        grid: {
          horzLines: { color: "rgba(26,42,58,0.4)" },
          vertLines: { color: "rgba(26,42,58,0.4)" },
        },
        timeScale: { borderColor: "#1A2A3A" },
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
      try {
        const api = baseUrl(testnet);
        const r = await fetch(`${api}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=120`);
        if (!r.ok) throw new Error(`klines ${r.status}`);
        const d: any[] = await r.json();
        if (!Array.isArray(d) || d.length === 0) throw new Error("no candles");
        const data = d.map((c) => ({
          time: Math.floor(c[0] / 1000) as any,
          open: +c[1],
          high: +c[2],
          low: +c[3],
          close: +c[4],
        }));
        series.setData(data);
        chart.timeScale().fitContent();
        if (!cancelled) setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
      }
      resizeHandler = () => {
        if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
      };
      window.addEventListener("resize", resizeHandler);
    }

    init();
    return () => {
      cancelled = true;
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      chartRef.current?.remove?.();
    };
  }, [symbol, testnet, interval]);

  return (
    <div className="relative w-full">
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-[10px] mono text-text-muted bg-surface/40 rounded-lg">
          Loading {interval} candles…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-[10px] mono text-danger/90 bg-surface/60 rounded-lg px-3 text-center">
          Chart unavailable ({testnet ? "testnet" : "live"} · {symbol})
        </div>
      )}
      <div ref={ref} className="w-full min-h-[220px]" />
    </div>
  );
}
