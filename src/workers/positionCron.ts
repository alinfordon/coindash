import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fetchCandles, fetchPrice, getOcoOrderList } from "@/lib/binance";
import { computeIndicatorSnapshot } from "@/lib/indicators";
import { buildPositionCheckPrompt, callAI, safeParseJson } from "@/lib/ai";
import { Trade } from "@/models/Trade";
import { AILog } from "@/models/AILog";
import { closePosition } from "@/lib/trading";
import { reconcileOpenTrades } from "@/lib/reconciliation";
import { resolveAnalysisIntervals } from "@/lib/analysisIntervals";
import { toObjectId, userScope, listPositionCronUserIds } from "@/lib/tenant";

export async function runPositionCron(opts: { manual?: boolean; userId?: string } = {}) {
  if (opts.userId) {
    return runPositionCronForUser(opts.userId, opts);
  }
  const userIds = await listPositionCronUserIds();
  if (userIds.length === 0) {
    return { skipped: true, reason: "no users with pilot + position cron active" };
  }
  const results = await Promise.all(userIds.map((id) => runPositionCronForUser(id, opts)));
  return userIds.length === 1 ? results[0] : { multi: true, results };
}

async function runPositionCronForUser(userId: string, opts: { manual?: boolean } = {}) {
  await connectDB();
  const settings = await getSettings(userId);
  const uid = toObjectId(userId);

  if (!opts.manual) {
    if (!settings.pilotActive) {
      console.log("[positionCron] skipped — AI Pilot is paused");
      return { skipped: true, reason: "pilot paused" };
    }
    if (!settings.positionCheckCronActive) {
      console.log("[positionCron] skipped — position check cron is disabled");
      return { skipped: true, reason: "position check cron disabled" };
    }
  }

  await AILog.create({
    userId: uid,
    action: "CRON_START",
    decision: "POSITION_CHECK",
    reasoning: "Position sweep starting",
  });

  let reconciled: { closed: any[]; kept: number; errors: any[] } = { closed: [], kept: 0, errors: [] };
  try {
    reconciled = await reconcileOpenTrades(userId, settings);
  } catch (e: any) {
    console.warn("[positionCron] reconcile pass failed:", e?.message || e);
  }

  const { entry: entryInterval } = resolveAnalysisIntervals(settings);
  const trades = await Trade.find(userScope(userId, { status: "OPEN" })).lean();
  const closed: any[] = [];

  for (const t of trades) {
    if (t.dryRun) continue;
    try {
      const price = await fetchPrice(t.pair as string, settings.binanceTestnet);
      const entry = t.entryPrice as number;
      const qty = t.quantity as number;
      const pnlUsdc = (price - entry) * qty;
      const pnlPct = ((price - entry) / entry) * 100;

      let ocoExecuting = false;
      if (t.ocoOrderId) {
        try {
          const list = await getOcoOrderList(t.pair as string, t.ocoOrderId as string, settings.binanceTestnet);
          if (list.listOrderStatus === "EXECUTING") ocoExecuting = true;
        } catch {
          /* OCO may be purged; fall through to mark-based checks */
        }
      }

      if (!ocoExecuting) {
        if (t.takeProfit && price >= (t.takeProfit as number)) {
          await closePosition(String(t._id), userId, "TP_HIT", settings);
          closed.push({ pair: t.pair, reason: "TP_HIT" });
          continue;
        }
        if (t.stopLoss && price <= (t.stopLoss as number)) {
          await closePosition(String(t._id), userId, "SL_HIT", settings);
          closed.push({ pair: t.pair, reason: "SL_HIT" });
          continue;
        }
      }

      const candles = await fetchCandles(t.pair as string, entryInterval, 50, settings.binanceTestnet);
      const snap = computeIndicatorSnapshot(candles.map((c) => c.close));
      const durationMin = Math.floor((Date.now() - new Date(t.openedAt as Date).getTime()) / 60000);

      const prompt = buildPositionCheckPrompt({
        pair: t.pair as string,
        entry,
        current: price,
        pnlPct,
        pnlUsdc,
        durationMin,
        stopLoss: t.stopLoss as number,
        takeProfit: t.takeProfit as number,
        rsi: snap.rsi,
        macdHist: snap.macd.histogram,
        trend: snap.trend5,
      });

      const ai = await callAI(prompt, settings);
      const parsed = safeParseJson<{ decision: string; confidence: number; reasoning: string }>(ai.text);

      await AILog.create({
        userId: uid,
        action: "POSITION_CHECK",
        pair: t.pair,
        decision: parsed?.decision ?? "HOLD",
        confidence: parsed?.confidence ?? 0,
        reasoning: parsed?.reasoning ?? "",
        tradeId: t._id,
        aiProvider: settings.aiProvider,
      });

      if (parsed?.decision === "SELL_NOW" && (parsed.confidence ?? 0) >= 80) {
        await closePosition(String(t._id), userId, "AI_DECISION", settings);
        closed.push({ pair: t.pair, reason: "AI_DECISION" });
      }
    } catch (e: any) {
      await AILog.create({ userId: uid, action: "ERROR", pair: t.pair, reasoning: `positionCron: ${e.message}` });
    }
  }

  await AILog.create({
    userId: uid,
    action: "CRON_END",
    decision: "POSITION_CHECK",
    reasoning: `Checked ${trades.length}, closed ${closed.length}, reconciled ${reconciled.closed.length}`,
  });

  return {
    checked: trades.length,
    closed: closed.length,
    reconciled: reconciled.closed.length,
    reconcileErrors: reconciled.errors.length,
  };
}
