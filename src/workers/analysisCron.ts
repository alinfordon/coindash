import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { topUsdcPairs, fetchCandles, fetch24h, fetchUsdcBalance, getSymbolInfo } from "@/lib/binance";
import { computeIndicatorSnapshot } from "@/lib/indicators";
import { buildAnalysisPrompt, callAI, safeParseJson } from "@/lib/ai";
import { Analysis } from "@/models/Analysis";
import { AILog } from "@/models/AILog";
import { Trade } from "@/models/Trade";
import { openPosition } from "@/lib/trading";
import { isPairBlacklisted } from "@/lib/pairBlacklist";

const CONCURRENCY = 5;

export async function runAnalysisCron(opts: { manual?: boolean } = {}) {
  await connectDB();
  const settings = await getSettings();

  if (!opts.manual) {
    if (!settings.pilotActive) {
      console.log("[analysisCron] skipped — AI Pilot is paused");
      return { skipped: true, reason: "pilot paused" };
    }
    if (!settings.analysisCronActive) {
      console.log("[analysisCron] skipped — analysis cron is disabled");
      return { skipped: true, reason: "analysis cron disabled" };
    }
  }

  await AILog.create({ action: "CRON_START", decision: "ANALYSIS", reasoning: "Market scan starting" });

  let pairs: { symbol: string; priceChangePercent: number; quoteVolume: number; lastPrice: number; highPrice: number; lowPrice: number; volume: number }[] = [];
  try {
    const top = await topUsdcPairs(50, settings.binanceTestnet);
    pairs = top.filter((x) => !isPairBlacklisted(x.symbol, settings.pairBlacklist));
  } catch (e: any) {
    await AILog.create({ action: "ERROR", reasoning: `topUsdcPairs: ${e.message}` });
    return { error: e.message };
  }

  const results: any[] = [];
  const queue = [...pairs];
  const workers = Array.from({ length: CONCURRENCY }, () => workerLoop());
  await Promise.all(workers);
  async function workerLoop() {
    while (queue.length) {
      const p = queue.shift();
      if (!p) return;
      try {
        const analysis = await analyzePair(p.symbol, settings);
        results.push(analysis);
      } catch (e: any) {
        await AILog.create({ action: "ERROR", pair: p.symbol, reasoning: e.message?.slice(0, 200) });
      }
    }
  }

  // Trade decision pass
  const opened: any[] = [];
  const openCount = await Trade.countDocuments({ status: "OPEN" });
  let remainingSlots = Math.max(0, settings.maxOpenPairs - openCount);

  // Recommendation distribution (for diagnostics)
  const dist: Record<string, number> = { STRONG_BUY: 0, BUY: 0, HOLD: 0, SELL: 0, STRONG_SELL: 0 };
  for (const a of results) {
    const r = (a as any)?.recommendation || "HOLD";
    dist[r] = (dist[r] || 0) + 1;
  }

  const buys = results.filter((a) => a && (a.recommendation === "BUY" || a.recommendation === "STRONG_BUY"));
  const buysSorted = [...buys].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const bestBuy = buysSorted[0];
  const candidates = buysSorted.filter((a) => (a.confidence ?? 0) >= settings.minConfidence);

  // Capital check: how much USDC is actually free on Binance?
  // Only enforced in live mode. In dry run we skip the balance gate.
  let remainingUsdc = Infinity;
  let initialUsdc: number | null = null;
  if (!settings.dryRun) {
    try {
      initialUsdc = await fetchUsdcBalance(settings.binanceTestnet);
      remainingUsdc = initialUsdc;
    } catch (e: any) {
      await AILog.create({ action: "ERROR", reasoning: `fetchUsdcBalance: ${e.message?.slice(0, 200)}` });
      // Fail-safe: if we can't read balance, don't open anything
      remainingUsdc = 0;
    }
  }

  const skipped: string[] = [];
  let insufficientCapital = false;
  for (const c of candidates) {
    if (remainingSlots <= 0) {
      skipped.push(`${c.pair}: maxOpenPairs reached`);
      continue;
    }
    const already = await Trade.findOne({ pair: c.pair, status: "OPEN" });
    if (already) {
      skipped.push(`${c.pair}: already open`);
      continue;
    }

    // Required USDC for this order = max(maxUsdcPerOrder, minNotional)
    let requiredUsdc = settings.maxUsdcPerOrder;
    if (!settings.dryRun) {
      try {
        const info = await getSymbolInfo(c.pair, settings.binanceTestnet).catch(() => null);
        if (info && info.minNotional > requiredUsdc) requiredUsdc = info.minNotional;
      } catch {
        /* ignore, fall back to settings.maxUsdcPerOrder */
      }

      if (remainingUsdc < requiredUsdc) {
        insufficientCapital = true;
        skipped.push(`${c.pair}: insufficient USDC (free=${remainingUsdc.toFixed(2)}, need=${requiredUsdc.toFixed(2)})`);
        // Highest-confidence candidate couldn't be funded → stop; lower-confidence ones won't fit either if they have same/higher requirement.
        // We still continue the loop in case a later candidate has a smaller minNotional (< requiredUsdc).
        continue;
      }
    }

    try {
      const t = await openPosition({
        pair: c.pair,
        usdcValue: settings.maxUsdcPerOrder,
        entryHint: c.price,
        stopLossPct: settings.stopLossPercent,
        takeProfitPct: Math.max(settings.takeProfitPercent, settings.stopLossPercent * settings.riskRewardRatio),
        aiProvider: settings.aiProvider,
        aiModel: settings.aiModel,
        aiConfidence: c.confidence ?? 0,
        aiReasoning: c.reasoning ?? "",
        indicators: c.indicators,
        settings,
      });
      opened.push(t);
      remainingSlots--;
      if (!settings.dryRun) remainingUsdc -= settings.maxUsdcPerOrder;
    } catch (e: any) {
      skipped.push(`${c.pair}: ${e.message?.slice(0, 80)}`);
      await AILog.create({ action: "ERROR", pair: c.pair, reasoning: `open fail: ${e.message}` });
    }
  }

  // Build human-readable reason for "no trade"
  let reason = "";
  if (opened.length > 0) {
    reason = `Opened ${opened.length}/${candidates.length} candidate(s)`;
    if (insufficientCapital) reason += ` — stopped early, insufficient USDC (${remainingUsdc.toFixed(2)} left)`;
  } else if (results.length === 0) {
    reason = "No pairs analyzed (Binance / network?)";
  } else if (buys.length === 0) {
    const topHold = [...results].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    reason = `No BUY signals. Dist: STRONG_BUY=${dist.STRONG_BUY} BUY=${dist.BUY} HOLD=${dist.HOLD} SELL=${dist.SELL} STRONG_SELL=${dist.STRONG_SELL}. Top: ${topHold?.pair} ${topHold?.recommendation} ${topHold?.confidence}%`;
  } else if (candidates.length === 0) {
    reason = `${buys.length} BUY signal(s) but none cleared minConfidence=${settings.minConfidence}%. Best: ${bestBuy?.pair} ${bestBuy?.recommendation} ${bestBuy?.confidence}%`;
  } else if (remainingSlots <= 0 && openCount > 0) {
    reason = `Slot cap reached: ${openCount}/${settings.maxOpenPairs} open. Best candidate skipped: ${candidates[0]?.pair} ${candidates[0]?.confidence}%`;
  } else if (insufficientCapital && initialUsdc !== null) {
    reason = `Insufficient USDC on Binance: free=${initialUsdc.toFixed(2)}, need=${settings.maxUsdcPerOrder.toFixed(2)}/order. Best candidate skipped: ${candidates[0]?.pair} ${candidates[0]?.confidence}%`;
  } else {
    reason = `Skipped all: ${skipped.join(" | ").slice(0, 250)}`;
  }

  await AILog.create({
    action: "CRON_END",
    decision: opened.length ? "OPENED" : insufficientCapital ? "NO_CAPITAL" : "NO_TRADE",
    reasoning: reason,
    meta: {
      analyzed: results.length,
      dist,
      buys: buys.length,
      candidates: candidates.length,
      opened: opened.length,
      openCount,
      remainingSlotsBefore: settings.maxOpenPairs - openCount,
      bestBuy: bestBuy ? { pair: bestBuy.pair, conf: bestBuy.confidence, rec: bestBuy.recommendation } : null,
      usdcFree: initialUsdc,
      insufficientCapital,
    },
  });

  return {
    analyzed: results.length,
    opened: opened.length,
    distribution: dist,
    buySignals: buys.length,
    candidates: candidates.length,
    openCount,
    maxOpenPairs: settings.maxOpenPairs,
    minConfidence: settings.minConfidence,
    bestBuy: bestBuy ? { pair: bestBuy.pair, confidence: bestBuy.confidence, recommendation: bestBuy.recommendation, reasoning: bestBuy.reasoning } : null,
    usdcFree: initialUsdc,
    insufficientCapital,
    reason,
    skipped,
  };
}

async function analyzePair(symbol: string, settings: any) {
  const [c1h, c15m, t24] = await Promise.all([
    fetchCandles(symbol, "1h", 100, settings.binanceTestnet),
    fetchCandles(symbol, "15m", 100, settings.binanceTestnet),
    fetch24h(symbol, settings.binanceTestnet),
  ]);
  const closes1h = c1h.map((c) => c.close);
  const snap = computeIndicatorSnapshot(closes1h);

  const prompt = buildAnalysisPrompt({
    pair: symbol,
    price: snap.price,
    rsi: snap.rsi,
    macdValue: snap.macd.value,
    macdSignal: snap.macd.signal,
    macdHist: snap.macd.histogram,
    bbUpper: snap.bb.upper,
    bbMiddle: snap.bb.middle,
    bbLower: snap.bb.lower,
    ema20: snap.ema20,
    ema50: snap.ema50,
    priceVsEma20: snap.priceVsEma20Pct,
    priceVsEma50: snap.priceVsEma50Pct,
    change24h: t24.priceChangePercent,
    volume24h: t24.quoteVolume,
    high24h: t24.highPrice,
    low24h: t24.lowPrice,
  });

  const ai = await callAI(prompt, settings);
  const parsed = safeParseJson<{
    recommendation: string;
    confidence: number;
    technicalScore: number;
    reasoning: string;
    keyFactors: string[];
    riskLevel: string;
  }>(ai.text);

  const doc = {
    pair: symbol,
    analyzedAt: new Date(),
    interval: "1h",
    technicalScore: parsed?.technicalScore ?? 0,
    fundamentalScore: 0,
    combinedScore: parsed?.technicalScore ?? 0,
    recommendation: (parsed?.recommendation as any) ?? "HOLD",
    confidence: parsed?.confidence ?? 0,
    reasoning: parsed?.reasoning ?? "",
    riskLevel: (parsed?.riskLevel as any) ?? "MEDIUM",
    keyFactors: parsed?.keyFactors ?? [],
    price: snap.price,
    indicators: {
      rsi: snap.rsi,
      macd: snap.macd,
      bb: snap.bb,
      ema20: snap.ema20,
      ema50: snap.ema50,
      volume24h: t24.quoteVolume,
      priceChange24h: t24.priceChangePercent,
      high24h: t24.highPrice,
      low24h: t24.lowPrice,
    },
    aiProvider: settings.aiProvider,
    aiModel: settings.aiModel,
    rawResponse: ai.text,
  };

  await Analysis.create(doc);
  await AILog.create({
    action: "ANALYSIS",
    pair: symbol,
    decision: doc.recommendation,
    confidence: doc.confidence,
    reasoning: doc.reasoning,
    aiProvider: settings.aiProvider,
  });
  return doc;
}
