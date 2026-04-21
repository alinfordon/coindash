import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fetchCandles, fetchPrice } from "@/lib/binance";
import { computeIndicatorSnapshot } from "@/lib/indicators";
import { buildPositionCheckPrompt, callAI, safeParseJson } from "@/lib/ai";
import { Trade } from "@/models/Trade";
import { AILog } from "@/models/AILog";
import { closePosition } from "@/lib/trading";

export async function runPositionCron(opts: { manual?: boolean } = {}) {
  await connectDB();
  const settings = await getSettings();
  if (!opts.manual && (!settings.pilotActive || !settings.positionCheckCronActive)) {
    return { skipped: true, reason: "cron disabled" };
  }

  await AILog.create({ action: "CRON_START", decision: "POSITION_CHECK", reasoning: "Position sweep starting" });

  const trades = await Trade.find({ status: "OPEN" }).lean();
  const closed: any[] = [];

  for (const t of trades) {
    try {
      const price = await fetchPrice(t.pair as string, settings.binanceTestnet);
      const entry = t.entryPrice as number;
      const qty = t.quantity as number;
      const pnlUsdc = (price - entry) * qty;
      const pnlPct = ((price - entry) / entry) * 100;

      if (t.takeProfit && price >= (t.takeProfit as number)) {
        await closePosition(String(t._id), "TP_HIT", settings);
        closed.push({ pair: t.pair, reason: "TP_HIT" });
        continue;
      }
      if (t.stopLoss && price <= (t.stopLoss as number)) {
        await closePosition(String(t._id), "SL_HIT", settings);
        closed.push({ pair: t.pair, reason: "SL_HIT" });
        continue;
      }

      const candles = await fetchCandles(t.pair as string, "15m", 50, settings.binanceTestnet);
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
        action: "POSITION_CHECK",
        pair: t.pair,
        decision: parsed?.decision ?? "HOLD",
        confidence: parsed?.confidence ?? 0,
        reasoning: parsed?.reasoning ?? "",
        tradeId: t._id,
        aiProvider: settings.aiProvider,
      });

      if (parsed?.decision === "SELL_NOW" && (parsed.confidence ?? 0) >= 80) {
        await closePosition(String(t._id), "AI_DECISION", settings);
        closed.push({ pair: t.pair, reason: "AI_DECISION" });
      }
    } catch (e: any) {
      await AILog.create({ action: "ERROR", pair: t.pair, reasoning: `positionCron: ${e.message}` });
    }
  }

  await AILog.create({
    action: "CRON_END",
    decision: "POSITION_CHECK",
    reasoning: `Checked ${trades.length}, closed ${closed.length}`,
  });

  return { checked: trades.length, closed: closed.length };
}
