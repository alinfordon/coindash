"use client";

import { useEffect, useRef } from "react";

export function MiniCandles({ symbol, testnet }: { symbol: string; testnet?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!ref.current) return;
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
        const base = testnet ? "https://testnet.binance.vision" : "https://api.binance.com";
        const r = await fetch(`${base}/api/v3/klines?symbol=${symbol}&interval=1h&limit=120`);
        const d: any[] = await r.json();
        const data = d.map((c) => ({
          time: Math.floor(c[0] / 1000) as any,
          open: +c[1],
          high: +c[2],
          low: +c[3],
          close: +c[4],
        }));
        series.setData(data);
        chart.timeScale().fitContent();
      } catch {}
      const onResize = () => {
        if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
      };
    }
    init();
    return () => {
      cancelled = true;
      chartRef.current?.remove?.();
    };
  }, [symbol, testnet]);

  return <div ref={ref} className="w-full" />;
}
