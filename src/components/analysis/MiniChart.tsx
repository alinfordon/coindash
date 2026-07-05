"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { klineStreamUrl } from "@/lib/binance";
import {
  guessKrakenAssetClass,
  krakenOhlcSubscribe,
  krakenPingMessage,
  KRAKEN_WS_V2,
  parseKrakenOhlcV2Message,
  symbolToKrakenWsName,
} from "@/lib/krakenWs";
import {
  DEFAULT_ANALYSIS_INDICATORS,
  normalizeAnalysisIndicators,
  type AnalysisIndicatorsConfig,
} from "@/lib/analysisIndicators";
import {
  ANALYSIS_INTERVAL_OPTIONS,
  isAnalysisInterval,
  normalizeAnalysisInterval,
} from "@/lib/analysisIntervals";
import {
  buildChartOverlays,
  chartLegendItems,
  chartPaneLayout,
  type ChartCandle,
} from "@/lib/chartOverlays";
import { cn, fmtNum } from "@/lib/utils";
import { Radio, Wifi, WifiOff } from "lucide-react";

export type ChartPriceLine = {
  price: number;
  color: string;
  title: string;
  dashed?: boolean;
};

type Props = {
  symbol: string;
  testnet?: boolean;
  exchange?: "binance" | "kraken";
  assetClass?: "crypto" | "tokenized_asset";
  interval?: string;
  title?: string;
  indicators?: AnalysisIndicatorsConfig;
  showIntervalPicker?: boolean;
  priceLines?: ChartPriceLine[];
  onLivePrice?: (price: number) => void;
};

function disposeChart(chart: { remove?: () => void } | null) {
  if (!chart) return;
  try {
    chart.remove?.();
  } catch {
    /* already disposed */
  }
}

function applyIndicatorOverlays(
  candles: ChartCandle[],
  interval: string,
  indicators: AnalysisIndicatorsConfig,
  candleSeries: any,
  overlaySeries: Record<string, any>,
  fibLineRefs: any[],
  LineStyle: { Dashed: number; Solid: number }
) {
  const overlays = buildChartOverlays(candles, interval, indicators);

  if (indicators.ema) {
    overlaySeries.ema20?.setData(overlays.ema20.map((p) => ({ time: p.time as never, value: p.value })));
    overlaySeries.ema50?.setData(overlays.ema50.map((p) => ({ time: p.time as never, value: p.value })));
  }
  if (indicators.bollinger) {
    overlaySeries.bbU?.setData(overlays.bbUpper.map((p) => ({ time: p.time as never, value: p.value })));
    overlaySeries.bbM?.setData(overlays.bbMiddle.map((p) => ({ time: p.time as never, value: p.value })));
    overlaySeries.bbL?.setData(overlays.bbLower.map((p) => ({ time: p.time as never, value: p.value })));
  }
  if (indicators.fibonacci) {
    for (const line of fibLineRefs) {
      try {
        candleSeries.removePriceLine(line);
      } catch {
        /* ignore */
      }
    }
    fibLineRefs.length = 0;
    for (const line of overlays.fibLines) {
      fibLineRefs.push(
        candleSeries.createPriceLine({
          price: line.price,
          color: line.color,
          lineWidth: line.lineWidth,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: line.title,
        })
      );
    }
  }
  if (indicators.elliottWave) {
    candleSeries.setMarkers(
      overlays.elliottMarkers.map((m) => ({
        time: m.time as never,
        position: m.position,
        color: m.color,
        shape: m.shape,
        size: m.size,
      }))
    );
  } else {
    candleSeries.setMarkers([]);
  }
  if (indicators.rsi) {
    overlaySeries.rsi?.setData(overlays.rsiData.map((p) => ({ time: p.time as never, value: p.value })));
  }
  if (indicators.macd) {
    overlaySeries.macdHist?.setData(
      overlays.macdHist.map((p) => ({
        time: p.time as never,
        value: p.value,
        color: p.color,
      }))
    );
    overlaySeries.macd?.setData(overlays.macdLine.map((p) => ({ time: p.time as never, value: p.value })));
    overlaySeries.macdSig?.setData(overlays.macdSignal.map((p) => ({ time: p.time as never, value: p.value })));
  }
}

export function MiniCandles({
  symbol,
  testnet = false,
  exchange = "binance",
  assetClass: assetClassProp,
  interval: intervalProp = "1h",
  title,
  indicators: indicatorsProp,
  showIntervalPicker = false,
  priceLines = [],
  onLivePrice,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const candleSeriesRef = useRef<any>(null);
  const tradePriceLineRefs = useRef<any[]>([]);
  const fibLineRefsRef = useRef<any[]>([]);
  const candlesRef = useRef<ChartCandle[]>([]);
  const overlaySeriesRef = useRef<Record<string, any>>({});
  const indicatorsRef = useRef(normalizeAnalysisIndicators(indicatorsProp ?? DEFAULT_ANALYSIS_INDICATORS));
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [wsState, setWsState] = useState<"connecting" | "open" | "closed">("connecting");
  const [livePrice, setLivePrice] = useState<number | null>(null);

  const defaultIv = normalizeAnalysisInterval(intervalProp, "1h");
  const [activeInterval, setActiveInterval] = useState(defaultIv);

  useEffect(() => {
    setActiveInterval(normalizeAnalysisInterval(intervalProp, "1h"));
  }, [intervalProp, symbol]);

  const assetClass = assetClassProp ?? (exchange === "kraken" ? guessKrakenAssetClass(symbol) : "crypto");

  const onLivePriceRef = useRef(onLivePrice);
  onLivePriceRef.current = onLivePrice;

  function publishLivePrice(price: number) {
    setLivePrice(price);
    onLivePriceRef.current?.(price);
  }

  const interval = showIntervalPicker ? activeInterval : defaultIv;

  const indicators = useMemo(
    () => normalizeAnalysisIndicators(indicatorsProp ?? DEFAULT_ANALYSIS_INDICATORS),
    [indicatorsProp]
  );
  indicatorsRef.current = indicators;

  const indicatorsKey = useMemo(() => JSON.stringify(indicators), [indicators]);
  const legend = useMemo(() => chartLegendItems(indicators), [indicators]);
  const layout = useMemo(() => chartPaneLayout(indicators), [indicators]);
  const priceLinesKey = useMemo(() => JSON.stringify(priceLines), [priceLines]);

  useEffect(() => {
    let cancelled = false;
    let chart: any = null;
    let resizeHandler: (() => void) | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    candleSeriesRef.current = null;
    tradePriceLineRefs.current = [];
    fibLineRefsRef.current = [];
    candlesRef.current = [];
    overlaySeriesRef.current = {};

    const isActive = () => !cancelled && chart != null && ref.current != null;

    let overlayLineStyle: { Dashed: number; Solid: number } = { Dashed: 2, Solid: 0 };

    function normalizeLiveCandle(candle: ChartCandle): ChartCandle | null {
      const time = typeof candle.time === "number" ? candle.time : Number(candle.time);
      if (!Number.isFinite(time) || time <= 0) return null;
      const open = +candle.open;
      const high = +candle.high;
      const low = +candle.low;
      const close = +candle.close;
      if (![open, high, low, close].every(Number.isFinite)) return null;
      return { time: Math.floor(time), open, high, low, close };
    }

    function applyLiveCandles(incoming: ChartCandle[]) {
      const ticks = incoming.map(normalizeLiveCandle).filter((c): c is ChartCandle => c != null);
      if (!ticks.length || !isActive() || !candleSeriesRef.current) return;

      if (ticks.length === 1) {
        applyLiveCandle(ticks[0]!);
        return;
      }

      const byTime = new Map<number, ChartCandle>();
      for (const c of candlesRef.current) byTime.set(c.time, c);
      for (const c of ticks) byTime.set(c.time, c);
      const merged = [...byTime.values()].sort((a, b) => a.time - b.time);
      const trimmed = merged.length > 300 ? merged.slice(-300) : merged;
      candlesRef.current = trimmed;

      candleSeriesRef.current.setData(
        trimmed.map((c) => ({
          time: c.time as never,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );

      applyIndicatorOverlays(
        trimmed,
        interval,
        indicatorsRef.current,
        candleSeriesRef.current,
        overlaySeriesRef.current,
        fibLineRefsRef.current,
        overlayLineStyle
      );

      const last = trimmed[trimmed.length - 1];
      if (last) publishLivePrice(last.close);
    }

    function applyLiveCandle(candle: ChartCandle) {
      const normalized = normalizeLiveCandle(candle);
      if (!normalized || !isActive() || !candleSeriesRef.current) return;

      const all = candlesRef.current;
      const last = all[all.length - 1];
      if (last && normalized.time < last.time) {
        return;
      }

      if (last && last.time === normalized.time) {
        all[all.length - 1] = normalized;
      } else if (!last || normalized.time > last.time) {
        all.push(normalized);
        if (all.length > 300) all.shift();
      } else {
        return;
      }

      try {
        candleSeriesRef.current.update({
          time: normalized.time as never,
          open: normalized.open,
          high: normalized.high,
          low: normalized.low,
          close: normalized.close,
        });
      } catch {
        return;
      }

      applyIndicatorOverlays(
        all,
        interval,
        indicatorsRef.current,
        candleSeriesRef.current,
        overlaySeriesRef.current,
        fibLineRefsRef.current,
        overlayLineStyle
      );

      publishLivePrice(normalized.close);
    }

    async function refreshLatestCandle() {
      if (!isActive()) return;
      try {
        const qs = new URLSearchParams({
          pair: symbol,
          interval,
          limit: "2",
          assetClass,
        });
        const r = await fetch(`/api/market/candles?${qs}`);
        if (!r.ok || !isActive()) return;
        const payload = await r.json();
        const rows = payload.candles as { openTime: number; open: number; high: number; low: number; close: number }[];
        const last = rows?.[rows.length - 1];
        if (!last) return;
        applyLiveCandle({
          time: Math.floor(Number(last.openTime) / 1000),
          open: +last.open,
          high: +last.high,
          low: +last.low,
          close: +last.close,
        });
        if (!cancelled) setWsState("open");
      } catch {
        /* ignore poll errors */
      }
    }

    function startKrakenPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(() => void refreshLatestCandle(), 15_000);
      if (!cancelled) setWsState("open");
    }

    async function init() {
      if (!ref.current) return;
      setStatus("loading");
      setWsState("connecting");
      setLivePrice(null);

      const { createChart, ColorType, LineStyle } = await import("lightweight-charts");
      overlayLineStyle = LineStyle;
      if (!ref.current || cancelled) return;

      ref.current.innerHTML = "";
      const height = layout.totalHeight;
      chart = createChart(ref.current, {
        width: ref.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: "rgba(0,0,0,0)" },
          textColor: "#5A7A9A",
          fontFamily: "JetBrains Mono",
          fontSize: 10,
        },
        grid: {
          horzLines: { color: "rgba(26,42,58,0.4)" },
          vertLines: { color: "rgba(26,42,58,0.25)" },
        },
        timeScale: { borderColor: "#1A2A3A", timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: "#1A2A3A", scaleMargins: layout.main },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: "#00FF88",
        downColor: "#FF3366",
        borderUpColor: "#00FF88",
        borderDownColor: "#FF3366",
        wickUpColor: "#00FF88",
        wickDownColor: "#FF3366",
      });
      candleSeriesRef.current = candleSeries;

      const overlaySeries: Record<string, any> = {};
      overlaySeriesRef.current = overlaySeries;
      const lineOpts = {
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      };

      const ind = indicatorsRef.current;
      if (ind.ema) {
        overlaySeries.ema20 = chart.addLineSeries({ color: "#FFC857", lineWidth: 2, ...lineOpts });
        overlaySeries.ema50 = chart.addLineSeries({ color: "#7B2FFF", lineWidth: 2, ...lineOpts });
      }
      if (ind.bollinger) {
        overlaySeries.bbU = chart.addLineSeries({
          color: "rgba(90,122,154,0.6)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          ...lineOpts,
        });
        overlaySeries.bbM = chart.addLineSeries({
          color: "rgba(90,122,154,0.35)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          ...lineOpts,
        });
        overlaySeries.bbL = chart.addLineSeries({
          color: "rgba(90,122,154,0.6)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          ...lineOpts,
        });
      }
      if (ind.rsi && layout.rsi) {
        overlaySeries.rsi = chart.addLineSeries({
          color: "#00F5FF",
          lineWidth: 1,
          priceScaleId: "rsi",
          ...lineOpts,
        });
        chart.priceScale("rsi").applyOptions({ scaleMargins: layout.rsi });
      }
      if (ind.macd && layout.macd) {
        overlaySeries.macdHist = chart.addHistogramSeries({
          priceScaleId: "macd",
          priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
        });
        overlaySeries.macd = chart.addLineSeries({
          color: "#FFC857",
          lineWidth: 1,
          priceScaleId: "macd",
          ...lineOpts,
        });
        overlaySeries.macdSig = chart.addLineSeries({
          color: "#7B2FFF",
          lineWidth: 1,
          priceScaleId: "macd",
          ...lineOpts,
        });
        chart.priceScale("macd").applyOptions({ scaleMargins: layout.macd });
      }

      let krakenWsMeta: {
        wsSymbol?: string;
        krakenIntervalMinutes?: number | null;
        wsSupported?: boolean;
      } = {};

      try {
        const qs = new URLSearchParams({
          pair: symbol,
          interval,
          limit: "120",
          assetClass,
        });
        const r = await fetch(`/api/market/candles?${qs}`);
        if (!isActive()) return;
        if (!r.ok) throw new Error(`candles ${r.status}`);
        const payload = await r.json();
        if (!payload.ok || !Array.isArray(payload.candles) || payload.candles.length === 0) {
          throw new Error("no candles");
        }
        if (exchange === "kraken") {
          krakenWsMeta = {
            wsSymbol: payload.wsSymbol,
            krakenIntervalMinutes: payload.krakenIntervalMinutes,
            wsSupported: payload.wsSupported,
          };
        }
        const d = payload.candles as { openTime: number; open: number; high: number; low: number; close: number }[];

        const candles: ChartCandle[] = d.map((c) => ({
          time: Math.floor(Number(c.openTime) / 1000),
          open: +c.open,
          high: +c.high,
          low: +c.low,
          close: +c.close,
        }));
        candlesRef.current = candles;

        if (!isActive()) return;

        candleSeries.setData(
          candles.map((c) => ({
            time: c.time as never,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );

        applyIndicatorOverlays(
          candles,
          interval,
          indicatorsRef.current,
          candleSeries,
          overlaySeries,
          fibLineRefsRef.current,
          LineStyle
        );

        if (!isActive()) return;
        chart.timeScale().fitContent();
        const last = candles[candles.length - 1];
        if (last) publishLivePrice(last.close);
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }

      if (!isActive()) return;

      if (exchange === "binance") {
        const wsUrl = klineStreamUrl(symbol, interval, testnet);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setWsState("connecting");

        ws.onopen = () => {
          if (!cancelled) setWsState("open");
        };
        ws.onclose = () => {
          if (!cancelled) setWsState("closed");
        };
        ws.onerror = () => {
          if (!cancelled) setWsState("closed");
        };
        ws.onmessage = (ev) => {
          if (cancelled || !candleSeriesRef.current) return;
          try {
            const msg = JSON.parse(ev.data as string);
            const k = msg?.k;
            if (!k) return;

            applyLiveCandle({
              time: Math.floor(k.t / 1000),
              open: +k.o,
              high: +k.h,
              low: +k.l,
              close: +k.c,
            });
          } catch {
            /* ignore malformed tick */
          }
        };
      } else if (exchange === "kraken") {
        const wsSymbol =
          (typeof krakenWsMeta.wsSymbol === "string" && krakenWsMeta.wsSymbol) ||
          symbolToKrakenWsName(symbol);
        const krakenMinutes =
          typeof krakenWsMeta.krakenIntervalMinutes === "number"
            ? krakenWsMeta.krakenIntervalMinutes
            : null;
        const wsSupported = krakenWsMeta.wsSupported === true && krakenMinutes != null;

        if (!wsSupported) {
          startKrakenPolling();
        } else {
          const ws = new WebSocket(KRAKEN_WS_V2);
          wsRef.current = ws;
          setWsState("connecting");

          ws.onopen = () => {
            if (cancelled) return;
            ws.send(krakenOhlcSubscribe(wsSymbol, krakenMinutes!));
            pingTimer = setInterval(() => {
              try {
                if (ws.readyState === WebSocket.OPEN) ws.send(krakenPingMessage());
              } catch {
                /* ignore */
              }
            }, 50_000);
            setWsState("open");
          };

          ws.onclose = () => {
            if (cancelled) return;
            setWsState("closed");
            startKrakenPolling();
          };

          ws.onerror = () => {
            if (!cancelled) setWsState("closed");
          };

          ws.onmessage = (ev) => {
            if (cancelled || !candleSeriesRef.current) return;
            const ticks = parseKrakenOhlcV2Message(ev.data as string);
            applyLiveCandles(ticks);
          };
        }
      } else {
        setWsState("closed");
      }

      resizeHandler = () => {
        if (!isActive() || !chart || !ref.current) return;
        try {
          chart.applyOptions({ width: ref.current.clientWidth });
        } catch {
          /* disposed */
        }
      };
      window.addEventListener("resize", resizeHandler);
    }

    void init();

    return () => {
      cancelled = true;
      if (pingTimer) clearInterval(pingTimer);
      if (pollTimer) clearInterval(pollTimer);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      disposeChart(chart);
      chart = null;
      candleSeriesRef.current = null;
      tradePriceLineRefs.current = [];
      fibLineRefsRef.current = [];
    };
  }, [symbol, testnet, exchange, interval, indicatorsKey, layout]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || status !== "ok") return;

    for (const line of tradePriceLineRefs.current) {
      try {
        series.removePriceLine(line);
      } catch {
        /* ignore */
      }
    }
    tradePriceLineRefs.current = [];

    void (async () => {
      const { LineStyle } = await import("lightweight-charts");
      for (const pl of priceLines) {
        if (!Number.isFinite(pl.price) || pl.price <= 0) continue;
        try {
          const lineRef = series.createPriceLine({
            price: pl.price,
            color: pl.color,
            lineWidth: 2,
            lineStyle: pl.dashed ? LineStyle.Dashed : LineStyle.Solid,
            axisLabelVisible: true,
            title: pl.title,
          });
          tradePriceLineRefs.current.push(lineRef);
        } catch {
          /* disposed */
        }
      }
    })();
  }, [priceLinesKey, status, priceLines]);

  const chartBody = (
    <div className="relative px-1 pb-1">
      {status === "loading" && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center text-[10px] mono text-text-muted bg-surface/40 rounded-lg"
          style={{ minHeight: layout.totalHeight }}
        >
          Loading {interval} candles…
        </div>
      )}
      {status === "error" && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center text-[10px] mono text-danger/90 bg-surface/60 rounded-lg px-3 text-center"
          style={{ minHeight: layout.totalHeight }}
        >
          Chart unavailable (
          {exchange === "kraken" ? "Kraken" : testnet ? "testnet" : "live"} · {symbol})
        </div>
      )}
      <div ref={ref} className="w-full" style={{ minHeight: layout.totalHeight }} />
    </div>
  );

  return (
    <div className="w-full space-y-1.5">
      <div className="rounded-lg border border-border/40 bg-surface-2/10 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 border-b border-border/40">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {title && (
              <span className="text-[10px] mono uppercase tracking-widest text-text-muted shrink-0">
                {title}
              </span>
            )}
            {status === "ok" && (
              <>
                <span
                  className={cn(
                    "chip text-[10px] border",
                    wsState === "open"
                      ? "border-success/40 text-success"
                      : wsState === "connecting"
                        ? "border-warning/40 text-warning"
                        : "border-danger/40 text-danger"
                  )}
                >
                  {wsState === "open" ? (
                    <Wifi className="h-3 w-3" />
                  ) : wsState === "closed" ? (
                    <WifiOff className="h-3 w-3" />
                  ) : (
                    <Radio className="h-3 w-3 animate-pulse" />
                  )}
                  LIVE {wsState.toUpperCase()}
                </span>
                {livePrice != null && (
                  <span className="chip border-primary/40 text-primary text-[10px] mono">
                    {fmtNum(livePrice, 6)}
                  </span>
                )}
              </>
            )}
          </div>
          {showIntervalPicker && (
            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
              {ANALYSIS_INTERVAL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] mono transition-colors border",
                    interval === o.value
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "text-text-muted hover:text-text-primary border-transparent"
                  )}
                  onClick={() => {
                    if (isAnalysisInterval(o.value)) setActiveInterval(o.value);
                  }}
                >
                  {o.value}
                </button>
              ))}
            </div>
          )}
        </div>
        {chartBody}
      </div>
      {legend.length > 0 && status === "ok" && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] mono text-text-muted px-1">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-[3px] w-3.5 rounded-full"
                style={{
                  background: item.color,
                  boxShadow: `0 0 4px ${item.color}`,
                }}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
