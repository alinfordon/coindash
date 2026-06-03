import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { toObjectId, userScope, listAnalysisCronUserIds } from "@/lib/tenant";
import { topUsdcPairs, fetchCandles, fetch24h, fetchUsdcBalance, getSymbolInfo } from "@/lib/binance";
import { computeIndicatorSnapshot, isIndicatorSnapshotValid } from "@/lib/indicators";
import { buildAnalysisPrompt, callAI, resolveAiProfile, assertAiReady, safeParseJson } from "@/lib/ai";
import { Analysis } from "@/models/Analysis";
import { AILog } from "@/models/AILog";
import { Trade } from "@/models/Trade";
import { openPosition } from "@/lib/trading";
import { isPairBlacklisted } from "@/lib/pairBlacklist";
import { resolveAnalysisIntervals } from "@/lib/analysisIntervals";
import {
  compareBuyCandidates,
  entryGateFromSettings,
  passesEntryGate,
  pairReopenBlocked,
} from "@/lib/entryGate";

const CONCURRENCY = 5;

async function hasCapitalForNewOrder(settings: Awaited<ReturnType<typeof getSettings>>): Promise<{
  ok: boolean;
  reason?: string;
  freeUsdc?: number;
}> {
  if (settings.dryRun) return { ok: true };
  try {
    const freeUsdc = await fetchUsdcBalance(settings.binanceTestnet);
    const required = settings.maxUsdcPerOrder;
    if (freeUsdc + 1e-6 < required) {
      return {
        ok: false,
        freeUsdc,
        reason: `insufficient USDC (free=${freeUsdc.toFixed(2)}, need=${required.toFixed(2)}/order)`,
      };
    }
    return { ok: true, freeUsdc };
  } catch (e: any) {
    return { ok: false, reason: `USDC balance check failed: ${e.message?.slice(0, 120)}` };
  }
}

/** Scheduled cron only: skip scan when no room or no USDC for a new order. */
async function scheduledAnalysisPreflight(
  userId: string,
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<
  | { ok: true; openCount: number; freeUsdc?: number }
  | { ok: false; decision: "NO_SLOTS" | "NO_CAPITAL"; reason: string; meta?: Record<string, unknown> }
> {
  const openCount = await Trade.countDocuments(userScope(userId, { status: "OPEN" }));
  if (openCount >= settings.maxOpenPairs) {
    return {
      ok: false,
      decision: "NO_SLOTS",
      reason: `slot cap reached (${openCount}/${settings.maxOpenPairs} open)`,
      meta: { openCount, maxOpenPairs: settings.maxOpenPairs },
    };
  }

  const capital = await hasCapitalForNewOrder(settings);
  if (!capital.ok) {
    return {
      ok: false,
      decision: "NO_CAPITAL",
      reason: capital.reason ?? "insufficient capital",
      meta: { freeUsdc: capital.freeUsdc, maxUsdcPerOrder: settings.maxUsdcPerOrder, openCount },
    };
  }

  return { ok: true, openCount, freeUsdc: capital.freeUsdc };
}

export async function runAnalysisCron(opts: { manual?: boolean; userId?: string } = {}) {
  if (opts.userId) {
    return runAnalysisCronForUser(opts.userId, opts);
  }
  const userIds = await listAnalysisCronUserIds();
  if (userIds.length === 0) {
    return { skipped: true, reason: "no users with pilot + analysis cron active" };
  }
  const results = await Promise.all(userIds.map((id) => runAnalysisCronForUser(id, opts)));
  return userIds.length === 1 ? results[0] : { multi: true, results };
}

async function runAnalysisCronForUser(userId: string, opts: { manual?: boolean } = {}) {
  await connectDB();
  const settings = await getSettings(userId);
  const uid = toObjectId(userId);

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

  if (!opts.manual) {
    const preflight = await scheduledAnalysisPreflight(userId, settings);
    if (preflight.ok === false) {
      console.log(`[analysisCron] skipped — ${preflight.reason}`);
      await AILog.create({
        userId: uid,
        action: "CRON_END",
        decision: preflight.decision,
        reasoning: `Analysis skipped (scheduled): ${preflight.reason}`,
        meta: preflight.meta,
      });
      return {
        skipped: true,
        reason: preflight.reason,
        insufficientCapital: preflight.decision === "NO_CAPITAL",
        slotCapReached: preflight.decision === "NO_SLOTS",
        ...preflight.meta,
      };
    }
  }

  await AILog.create({ userId: uid, action: "CRON_START", decision: "ANALYSIS", reasoning: "Market scan starting" });

  try {
    assertAiReady(settings, "analysis");
  } catch (e: any) {
    const msg = e?.message || "AI not configured";
    await AILog.create({ userId: uid, action: "CRON_END", decision: "AI_CONFIG", reasoning: msg });
    return { error: msg, analyzed: 0, opened: 0, reason: msg };
  }

  let pairs: { symbol: string; priceChangePercent: number; quoteVolume: number; lastPrice: number; highPrice: number; lowPrice: number; volume: number }[] = [];
  let pairsBeforeBlacklist = 0;
  try {
    const top = await topUsdcPairs(50, settings.binanceTestnet);
    pairsBeforeBlacklist = top.length;
    pairs = top.filter((x) => !isPairBlacklisted(x.symbol, settings.pairBlacklist));
  } catch (e: any) {
    await AILog.create({ userId: uid, action: "ERROR", reasoning: `topUsdcPairs: ${e.message}` });
    return { error: e.message };
  }

  if (pairs.length === 0) {
    const reason = pairsBeforeBlacklist
      ? `All ${pairsBeforeBlacklist} volume-qualified pairs are blacklisted — check Settings → Pair blacklist`
      : settings.binanceTestnet
      ? "No USDC pairs on Binance testnet passed volume filter — check network or try live mode"
      : "No USDC pairs matched volume filter (Binance / network?)";
    await AILog.create({
      userId: uid,
      action: "CRON_END",
      decision: "NO_PAIRS",
      reasoning: reason,
      meta: { pairsBeforeBlacklist, testnet: settings.binanceTestnet },
    });
    return { analyzed: 0, opened: 0, pairsQueued: 0, reason };
  }

  const results: any[] = [];
  const analyzeErrors: string[] = [];
  const queue = [...pairs];

  async function workerLoop() {
    while (queue.length) {
      const p = queue.shift();
      if (!p) return;
      try {
        const analysis = await analyzePair(userId, p.symbol, settings);
        results.push(analysis);
      } catch (e: any) {
        const msg = `${p.symbol}: ${e.message?.slice(0, 160) || "unknown error"}`;
        analyzeErrors.push(msg);
        await AILog.create({ userId: uid, action: "ERROR", pair: p.symbol, reasoning: e.message?.slice(0, 200) });
      }
    }
  }

  const aiConcurrency = settings.aiProvider === "ollama" ? CONCURRENCY : 2;
  await Promise.all(Array.from({ length: aiConcurrency }, () => workerLoop()));

  // Trade decision pass
  const opened: any[] = [];
  const openCount = await Trade.countDocuments(userScope(userId, { status: "OPEN" }));
  let remainingSlots = Math.max(0, settings.maxOpenPairs - openCount);

  // Recommendation distribution (for diagnostics)
  const dist: Record<string, number> = { STRONG_BUY: 0, BUY: 0, HOLD: 0, SELL: 0, STRONG_SELL: 0 };
  for (const a of results) {
    const r = (a as any)?.recommendation || "HOLD";
    dist[r] = (dist[r] || 0) + 1;
  }

  const gate = entryGateFromSettings(settings);

  const buys = results.filter((a) => a && (a.recommendation === "BUY" || a.recommendation === "STRONG_BUY"));
  const confidenceFiltered = buys.filter((a) => (a.confidence ?? 0) >= settings.minConfidence);
  const gateSkipped: string[] = [];
  const gated = confidenceFiltered.filter((a) => {
    const r = passesEntryGate(
      {
        pair: a.pair,
        recommendation: a.recommendation,
        confidence: a.confidence ?? 0,
        technicalScore: a.technicalScore ?? 0,
        price: a.price,
        indicators: a.indicators,
      },
      gate
    );
    if (!r.ok) {
      gateSkipped.push(`${a.pair}: ${r.reason}`);
      return false;
    }
    return true;
  });
  const candidates = [...gated].sort(compareBuyCandidates);
  const bestBuy = candidates[0] ?? confidenceFiltered.sort(compareBuyCandidates)[0];

  // Capital check: how much USDC is actually free on Binance?
  // Only enforced in live mode. In dry run we skip the balance gate.
  let remainingUsdc = Infinity;
  let initialUsdc: number | null = null;
  if (!settings.dryRun) {
    try {
      initialUsdc = await fetchUsdcBalance(settings.binanceTestnet);
      remainingUsdc = initialUsdc;
    } catch (e: any) {
      await AILog.create({ userId: uid, action: "ERROR", reasoning: `fetchUsdcBalance: ${e.message?.slice(0, 200)}` });
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
    const already = await Trade.findOne(userScope(userId, { pair: c.pair, status: "OPEN" }));
    if (already) {
      skipped.push(`${c.pair}: already open`);
      continue;
    }
    const cooldown = await pairReopenBlocked(userId, c.pair, gate);
    if (cooldown.blocked) {
      skipped.push(`${c.pair}: ${cooldown.reason}`);
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
        userId,
        pair: c.pair,
        usdcValue: settings.maxUsdcPerOrder,
        entryHint: c.price,
        stopLossPct: settings.stopLossPercent,
        takeProfitPct: Math.max(settings.takeProfitPercent, settings.stopLossPercent * settings.riskRewardRatio),
        aiProvider: settings.aiProvider,
        aiModel: resolveAiProfile(settings, "analysis").model,
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
      await AILog.create({ userId: uid, action: "ERROR", pair: c.pair, reasoning: `open fail: ${e.message}` });
    }
  }

  // Build human-readable reason for "no trade"
  let reason = "";
  if (opened.length > 0) {
    reason = `Opened ${opened.length}/${candidates.length} candidate(s)`;
    if (insufficientCapital) reason += ` — stopped early, insufficient USDC (${remainingUsdc.toFixed(2)} left)`;
  } else if (results.length === 0) {
    const sample = analyzeErrors.slice(0, 3).join(" | ");
    reason = sample
      ? `0/${pairs.length} pairs analyzed — ${sample}`
      : `0/${pairs.length} pairs analyzed (unknown errors — check AI Logs)`;
  } else if (buys.length === 0) {
    const topHold = [...results].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    reason = `No BUY signals. Dist: STRONG_BUY=${dist.STRONG_BUY} BUY=${dist.BUY} HOLD=${dist.HOLD} SELL=${dist.SELL} STRONG_SELL=${dist.STRONG_SELL}. Top: ${topHold?.pair} ${topHold?.recommendation} ${topHold?.confidence}%`;
  } else if (candidates.length === 0 && confidenceFiltered.length > 0) {
    reason = `${confidenceFiltered.length} BUY cleared confidence but entry gate blocked all. Gate: ${gateSkipped.slice(0, 4).join(" | ")}`;
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
    userId: uid,
    action: "CRON_END",
    decision: opened.length ? "OPENED" : insufficientCapital ? "NO_CAPITAL" : "NO_TRADE",
    reasoning: reason,
    meta: {
      analyzed: results.length,
      pairsQueued: pairs.length,
      analyzeErrors: analyzeErrors.length,
      dist,
      buys: buys.length,
      candidates: candidates.length,
      gateSkipped: gateSkipped.length,
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
    pairsQueued: pairs.length,
    analyzeErrors: analyzeErrors.slice(0, 8),
    opened: opened.length,
    distribution: dist,
    buySignals: buys.length,
    confidencePassed: confidenceFiltered.length,
    candidates: candidates.length,
    gateSkipped,
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

async function analyzePair(userId: string, symbol: string, settings: Awaited<ReturnType<typeof getSettings>>) {
  const uid = toObjectId(userId);
  const { trend, entry } = resolveAnalysisIntervals(settings);
  const [cTrend, cEntry, t24] = await Promise.all([
    fetchCandles(symbol, trend, 100, settings.binanceTestnet),
    fetchCandles(symbol, entry, 100, settings.binanceTestnet),
    fetch24h(symbol, settings.binanceTestnet),
  ]);
  const closesTrend = cTrend.map((c) => c.close);
  const closesEntry = cEntry.map((c) => c.close);
  const snap = computeIndicatorSnapshot(closesTrend);
  const snapEntry = computeIndicatorSnapshot(closesEntry);

  if (!isIndicatorSnapshotValid(snap)) {
    throw new Error(`${symbol}: incomplete ${trend} indicators (need more candle history)`);
  }

  const prompt = buildAnalysisPrompt({
    pair: symbol,
    trendInterval: trend,
    entryInterval: entry,
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
    rsiEntry: snapEntry.rsi,
    macdHistEntry: snapEntry.macd.histogram,
    trendEntry: snapEntry.trend5,
    priceVsEma20Entry: snapEntry.priceVsEma20Pct,
    change24h: t24.priceChangePercent,
    volume24h: t24.quoteVolume,
    high24h: t24.highPrice,
    low24h: t24.lowPrice,
  });

  const ai = await callAI(prompt, settings, { role: "analysis" });
  const aiProfile = resolveAiProfile(settings, "analysis");
  const parsed = safeParseJson<{
    recommendation: string;
    confidence: number;
    technicalScore: number;
    reasoning: string;
    keyFactors: string[];
    riskLevel: string;
  }>(ai.text);

  if (!parsed) {
    await AILog.create({
      userId: uid,
      action: "ERROR",
      pair: symbol,
      reasoning: `AI JSON parse failed: ${ai.text.slice(0, 180)}`,
      aiProvider: settings.aiProvider,
    });
  }

  const doc = {
    userId: uid,
    pair: symbol,
    analyzedAt: new Date(),
    interval: trend,
    entryInterval: entry,
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
      trendInterval: trend,
      entryInterval: entry,
      rsi15m: snapEntry.rsi,
      macdHist15m: snapEntry.macd.histogram,
      trend15m: snapEntry.trend5,
      volume24h: t24.quoteVolume,
      priceChange24h: t24.priceChangePercent,
      high24h: t24.highPrice,
      low24h: t24.lowPrice,
    },
    aiProvider: aiProfile.provider,
    aiModel: aiProfile.model,
    rawResponse: ai.text,
  };

  await Analysis.create(doc);
  await AILog.create({
    userId: uid,
    action: "ANALYSIS",
    pair: symbol,
    decision: doc.recommendation,
    confidence: doc.confidence,
    reasoning: doc.reasoning,
    aiProvider: aiProfile.provider,
  });
  return doc;
}
