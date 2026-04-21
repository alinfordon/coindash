"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ema, rsi, macd, bollinger } from "@/lib/indicators";
import { classOfPnl, fmtNum, fmtPct } from "@/lib/utils";
import { Activity, Radio, Wifi, WifiOff } from "lucide-react";

type Interval = "1m" | "5m" | "15m" | "1h" | "4h";

type Candle = {
  time: number; // seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Props = {
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity?: number;
  height?: number;
};

const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h"];

export function PositionChart({
  symbol,
  entryPrice,
  stopLoss,
  takeProfit,
  quantity,
  height = 360,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volSeriesRef = useRef<any>(null);
  const ema20Ref = useRef<any>(null);
  const ema50Ref = useRef<any>(null);
  const bbUpperRef = useRef<any>(null);
  const bbMidRef = useRef<any>(null);
  const bbLowerRef = useRef<any>(null);
  const lineEntryRef = useRef<any>(null);
  const lineSLRef = useRef<any>(null);
  const lineTPRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  const [interval, setInterval] = useState<Interval>("15m");
  const [wsState, setWsState] = useState<"connecting" | "open" | "closed">("connecting");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [snapshot, setSnapshot] = useState<{
    rsi: number;
    macdHist: number;
    ema20: number;
    ema50: number;
    bbWidthPct: number;
  } | null>(null);

  // --- init chart once per symbol/interval ---
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    async function init() {
      if (!containerRef.current) return;
      const { createChart, ColorType, LineStyle, CrosshairMode } = await import("lightweight-charts");
      if (cancelled || !containerRef.current) return;

      containerRef.current.innerHTML = "";
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
          horzLines: { color: "rgba(26,42,58,0.35)" },
          vertLines: { color: "rgba(26,42,58,0.25)" },
        },
        timeScale: {
          borderColor: "#1A2A3A",
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: { borderColor: "#1A2A3A", scaleMargins: { top: 0.1, bottom: 0.25 } },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "#00F5FF55", labelBackgroundColor: "#00F5FF" },
          horzLine: { color: "#00F5FF55", labelBackgroundColor: "#00F5FF" },
        },
      });
      chartRef.current = chart;

      const candleSeries = chart.addCandlestickSeries({
        upColor: "#00FF88",
        downColor: "#FF3366",
        borderUpColor: "#00FF88",
        borderDownColor: "#FF3366",
        wickUpColor: "#00FF88",
        wickDownColor: "#FF3366",
      });
      candleSeriesRef.current = candleSeries;

      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "",
        color: "rgba(0,245,255,0.25)",
      });
      // Put volume at bottom
      (volSeries as any).priceScale?.().applyOptions?.({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volSeriesRef.current = volSeries;

      ema20Ref.current = chart.addLineSeries({
        color: "#FFC857",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      ema50Ref.current = chart.addLineSeries({
        color: "#7B2FFF",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      bbUpperRef.current = chart.addLineSeries({
        color: "rgba(90,122,154,0.55)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      bbMidRef.current = chart.addLineSeries({
        color: "rgba(90,122,154,0.35)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      bbLowerRef.current = chart.addLineSeries({
        color: "rgba(90,122,154,0.55)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      // Price lines (entry / SL / TP)
      lineEntryRef.current = candleSeries.createPriceLine({
        price: entryPrice,
        color: "#00F5FF",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "ENTRY",
      });
      lineSLRef.current = candleSeries.createPriceLine({
        price: stopLoss,
        color: "#FF3366",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "SL",
      });
      lineTPRef.current = candleSeries.createPriceLine({
        price: takeProfit,
        color: "#00FF88",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "TP",
      });

      // Load historical candles
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=300`,
        );
        const raw: any[] = await res.json();
        const candles: Candle[] = raw.map((c) => ({
          time: Math.floor(c[0] / 1000),
          open: +c[1],
          high: +c[2],
          low: +c[3],
          close: +c[4],
          volume: +c[5],
        }));
        candlesRef.current = candles;

        candleSeries.setData(candles.map((c) => ({
          time: c.time as any,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })));
        volSeries.setData(candles.map((c) => ({
          time: c.time as any,
          value: c.volume,
          color: c.close >= c.open ? "rgba(0,255,136,0.35)" : "rgba(255,51,102,0.35)",
        })));

        applyIndicators(candles);
        const last = candles[candles.length - 1];
        if (last) {
          setLivePrice(last.close);
          setLastUpdate(Date.now());
        }
        chart.timeScale().fitContent();
      } catch (e) {
        console.error("klines load failed", e);
      }

      // Connect WebSocket
      const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setWsState("connecting");
      ws.onopen = () => setWsState("open");
      ws.onclose = () => setWsState("closed");
      ws.onerror = () => setWsState("closed");
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const k = msg?.k;
          if (!k) return;
          const candle: Candle = {
            time: Math.floor(k.t / 1000),
            open: +k.o,
            high: +k.h,
            low: +k.l,
            close: +k.c,
            volume: +k.v,
          };
          const all = candlesRef.current;
          const last = all[all.length - 1];
          if (last && last.time === candle.time) {
            all[all.length - 1] = candle;
          } else if (!last || candle.time > last.time) {
            all.push(candle);
            if (all.length > 600) all.shift();
          }
          candleSeriesRef.current?.update({
            time: candle.time as any,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          });
          volSeriesRef.current?.update({
            time: candle.time as any,
            value: candle.volume,
            color: candle.close >= candle.open ? "rgba(0,255,136,0.35)" : "rgba(255,51,102,0.35)",
          });
          setLivePrice(candle.close);
          setLastUpdate(Date.now());
          // Indicators are relatively cheap on 300 candles; recompute
          applyIndicators(all);
        } catch {}
      };

      const onResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        }
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        try { ws.close(); } catch {}
      };
    }

    init();

    return () => {
      cancelled = true;
      cleanup?.();
      try { wsRef.current?.close(); } catch {}
      try { chartRef.current?.remove(); } catch {}
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval, height]);

  // Update SL/TP/Entry price lines if they change
  useEffect(() => {
    try {
      lineEntryRef.current?.applyOptions({ price: entryPrice });
      lineSLRef.current?.applyOptions({ price: stopLoss });
      lineTPRef.current?.applyOptions({ price: takeProfit });
    } catch {}
  }, [entryPrice, stopLoss, takeProfit]);

  function applyIndicators(candles: Candle[]) {
    if (!candles.length) return;
    const closes = candles.map((c) => c.close);
    const e20 = ema(closes, 20);
    const e50 = ema(closes, 50);
    const bb = bollinger(closes, 20, 2);
    const r = rsi(closes, 14);
    const m = macd(closes, 12, 26, 9);

    const mapSeries = (arr: number[]) =>
      candles
        .map((c, i) => ({ time: c.time as any, value: arr[i] }))
        .filter((p) => Number.isFinite(p.value));

    ema20Ref.current?.setData(mapSeries(e20));
    ema50Ref.current?.setData(mapSeries(e50));
    bbUpperRef.current?.setData(mapSeries(bb.upper));
    bbMidRef.current?.setData(mapSeries(bb.middle));
    bbLowerRef.current?.setData(mapSeries(bb.lower));

    const idx = closes.length - 1;
    const bbw =
      Number.isFinite(bb.upper[idx]) && Number.isFinite(bb.lower[idx]) && bb.middle[idx]
        ? ((bb.upper[idx] - bb.lower[idx]) / bb.middle[idx]) * 100
        : NaN;
    setSnapshot({
      rsi: r[idx],
      macdHist: m.hist[idx],
      ema20: e20[idx],
      ema50: e50[idx],
      bbWidthPct: bbw,
    });
  }

  const pnlPct = useMemo(() => {
    if (!livePrice) return 0;
    return ((livePrice - entryPrice) / entryPrice) * 100;
  }, [livePrice, entryPrice]);
  const pnlUsdc = useMemo(() => {
    if (!livePrice || !quantity) return 0;
    return (livePrice - entryPrice) * quantity;
  }, [livePrice, entryPrice, quantity]);

  const distToSL = useMemo(() => {
    if (!livePrice) return 0;
    return ((livePrice - stopLoss) / livePrice) * 100;
  }, [livePrice, stopLoss]);
  const distToTP = useMemo(() => {
    if (!livePrice) return 0;
    return ((takeProfit - livePrice) / livePrice) * 100;
  }, [livePrice, takeProfit]);

  const agoSec = lastUpdate ? Math.floor((Date.now() - lastUpdate) / 1000) : null;

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="mono text-xs text-text-muted uppercase tracking-widest flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            {symbol}
          </div>
          <div className="flex rounded-md overflow-hidden border border-border/70">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                onClick={() => setInterval(iv)}
                className={`px-2.5 py-1 text-[11px] mono transition ${
                  interval === iv
                    ? "bg-primary/20 text-primary"
                    : "text-text-muted hover:text-text-primary hover:bg-surface-2/60"
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`chip text-[10px] ${
              wsState === "open"
                ? "border-success/40 text-success"
                : wsState === "connecting"
                  ? "border-warning/40 text-warning"
                  : "border-danger/40 text-danger"
            }`}
          >
            {wsState === "open" ? <Wifi className="h-3 w-3" /> : wsState === "closed" ? <WifiOff className="h-3 w-3" /> : <Radio className="h-3 w-3 animate-pulse" />}
            {wsState.toUpperCase()}
            {agoSec !== null && wsState === "open" && <span className="opacity-60">· {agoSec}s</span>}
          </span>
          {livePrice !== null && (
            <span className="chip border-primary/40 text-primary text-[11px]">
              <span className="pulse-dot" /> {fmtNum(livePrice, 6)}
            </span>
          )}
          <span className={`chip text-[11px] ${classOfPnl(pnlPct)} border-current/30`}>
            {fmtPct(pnlPct)}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div
        ref={containerRef}
        className="w-full rounded-lg border border-border/60 bg-surface-2/20"
        style={{ height }}
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] mono text-text-muted">
        <LegendSwatch color="#00F5FF" label="Entry (dashed)" />
        <LegendSwatch color="#FF3366" label="Stop Loss" />
        <LegendSwatch color="#00FF88" label="Take Profit" />
        <LegendSwatch color="#FFC857" label="EMA20" />
        <LegendSwatch color="#7B2FFF" label="EMA50" />
        <LegendSwatch color="#5A7A9A" label="Bollinger 20/2 (dotted)" />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <MiniStat label="Entry" value={fmtNum(entryPrice, 6)} />
        <MiniStat
          label="Stop Loss"
          value={fmtNum(stopLoss, 6)}
          sub={<span className="text-danger">{fmtPct(-Math.abs(distToSL))}</span>}
        />
        <MiniStat
          label="Take Profit"
          value={fmtNum(takeProfit, 6)}
          sub={<span className="text-success">+{fmtPct(distToTP).replace("+", "")}</span>}
        />
        <MiniStat
          label={quantity ? "Unrealized P&L" : "Live"}
          value={quantity ? `${pnlUsdc >= 0 ? "+" : ""}${pnlUsdc.toFixed(4)}` : fmtNum(livePrice ?? 0, 6)}
          sub={quantity ? <span className={classOfPnl(pnlPct)}>{fmtPct(pnlPct)}</span> : undefined}
          valueClass={quantity ? classOfPnl(pnlUsdc) : ""}
        />
      </div>

      {/* Indicator snapshot */}
      {snapshot && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <MiniStat
            label="RSI 14"
            value={Number.isFinite(snapshot.rsi) ? fmtNum(snapshot.rsi, 1) : "—"}
            valueClass={
              snapshot.rsi > 70 ? "text-danger" : snapshot.rsi < 30 ? "text-success" : "text-text-primary"
            }
          />
          <MiniStat
            label="MACD hist"
            value={Number.isFinite(snapshot.macdHist) ? fmtNum(snapshot.macdHist, 4) : "—"}
            valueClass={snapshot.macdHist >= 0 ? "text-success" : "text-danger"}
          />
          <MiniStat label="EMA20" value={Number.isFinite(snapshot.ema20) ? fmtNum(snapshot.ema20, 6) : "—"} />
          <MiniStat label="EMA50" value={Number.isFinite(snapshot.ema50) ? fmtNum(snapshot.ema50, 6) : "—"} />
          <MiniStat
            label="BB width"
            value={Number.isFinite(snapshot.bbWidthPct) ? `${snapshot.bbWidthPct.toFixed(2)}%` : "—"}
          />
        </div>
      )}
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
