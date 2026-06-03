import type { FilterQuery } from "mongoose";
import type { TradeDoc } from "@/models/Trade";
import { Trade } from "@/models/Trade";
import { dashboardClosedTradeMatch } from "@/lib/dashboardTrades";
import {
  addSevenDaysWallMonday,
  startOfCalendarMonthInTz,
  startOfCalendarYearInTz,
  startOfIsoWeekMondayInTz,
  startOfNextCalendarMonthInTz,
  startOfNextCalendarYearInTz,
} from "@/lib/tzCalendar";
import { getSettings } from "@/lib/settings";
import { fetchPortfolioValueUsdc } from "@/lib/binance";

/** Canonical closed-trade PnL (maps DB `pnlUsdc` → analytics `pnl`). */
export type ClosedTradePnL = {
  closedAt: Date;
  openedAt?: Date | null;
  pair: string;
  strategy: string;
  pnl: number;
  pnlPercent: number;
  fee: number;
  durationMinutes?: number | null;
};

export type AnalyticsTimeframe = "daily" | "weekly" | "monthly";

export type AnalyticsFilters = {
  userId: string;
  from?: Date | null;
  to?: Date | null;
  pair?: string | null;
  strategy?: string | null;
  timeframe: AnalyticsTimeframe;
  timezone: string;
  includeOpenInRecent: boolean;
};

export type EquityPoint = { ts: number; label: string; equity: number };
export type DrawdownPoint = { ts: number; label: string; ddPct: number; ddUsd: number; equity: number };
export type BucketBarPoint = { ts: number; label: string; pnl: number };
export type HistogramBin = { start: number; end: number; count: number; netPnl: number };
export type PairAggRow = { pair: string; pnl: number; trades: number; wins: number; losses: number };
export type StrategyAggRow = {
  strategy: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  avgTradePct: number;
};

export type RecentTradeRow = {
  id: string;
  symbol: string;
  side: string;
  entryPrice: number | null;
  exitPrice: number | null;
  quantity: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  fee: number | null;
  strategy: string;
  status: string;
  closedAt: string | null;
  openedAt: string | null;
  durationMinutes: number | null;
};

export type StrategyBreakdownRow = {
  strategy: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  pnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
};

export type AnalyticsMetrics = {
  totalNetPnL: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  expectancy: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  maxDrawdownUsd: number;
  currentDrawdownPct: number;
  currentDrawdownUsd: number;
  recoveryFactor: number;
  averageHoldingMinutes: number;
  longestWinningStreak: number;
  longestLosingStreak: number;
  /** Calendar ISO week → anchor; % = PnL perioadă / bază (vezi return*BasisUsd). */
  weeklyReturnPct: number;
  /** Calendar month în TZ; același model de bază. */
  monthlyReturnPct: number;
  /** An calendaristic în TZ; același model. */
  yearlyReturnPct: number;
  /** PnL realizat în fereastra săptămânii (USDC). */
  weeklyPeriodPnlUsd: number;
  monthlyPeriodPnlUsd: number;
  yearlyPeriodPnlUsd: number;
  /** Numitor folosit la % săpt.: max(|equity înainte|, max notional în perioadă, planșă din setări). */
  weeklyReturnBasisUsd: number;
  monthlyReturnBasisUsd: number;
  yearlyReturnBasisUsd: number;
  /** Valoarea totală portofoliu folosită ca numitor (Binance live sau snapshot Settings). */
  portfolioDenominatorUsd: number;
  portfolioDenominatorSource: "live" | "snapshot";
  portfolioSnapshotUpdatedAt: string | null;
  weeklyPortfolioReturnPct: number;
  monthlyPortfolioReturnPct: number;
  yearlyPortfolioReturnPct: number;
  dailyReturns: { date: string; ret: number; pnl: number }[];
  feesPercentage: number;
  totalFees: number;
  tradeCount: number;
  avgTradeReturnPct: number;
};

export type AnalyticsInsights = {
  bullets: string[];
  severity: "info" | "warning" | "critical";
};

export type AnalyticsReport = {
  filters: AnalyticsFilters;
  metrics: AnalyticsMetrics;
  equityCurve: EquityPoint[];
  drawdownCurve: DrawdownPoint[];
  timeframePnL: BucketBarPoint[];
  winLossHistogram: HistogramBin[];
  pnlByPair: PairAggRow[];
  strategyPerformance: StrategyAggRow[];
  topPairs: PairAggRow[];
  worstPairs: PairAggRow[];
  recentTrades: RecentTradeRow[];
  strategyBreakdown: StrategyBreakdownRow[];
  baselineWinRate: number;
  baselineTradeCount: number;
  insights: AnalyticsInsights;
  filterOptions: { pairs: string[]; strategies: string[] };
};

// ─── Pure metric helpers (closed trades only; numeric arrays are trade-level fields) ───

export function totalNetPnL(pnls: number[]): number {
  return pnls.reduce((a, b) => a + b, 0);
}

export function grossProfit(pnls: number[]): number {
  return pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
}

export function grossLoss(pnls: number[]): number {
  return pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0);
}

export function winRate(pnls: number[]): number {
  const n = pnls.length;
  if (!n) return 0;
  const wins = pnls.filter((p) => p > 0).length;
  return wins / n;
}

export function averageWin(pnls: number[]): number {
  const wins = pnls.filter((p) => p > 0);
  if (!wins.length) return 0;
  return wins.reduce((a, b) => a + b, 0) / wins.length;
}

export function averageLoss(pnls: number[]): number {
  const losses = pnls.filter((p) => p < 0);
  if (!losses.length) return 0;
  return losses.reduce((a, b) => a + b, 0) / losses.length;
}

export function expectancy(pnls: number[]): number {
  const wr = winRate(pnls);
  const aw = averageWin(pnls);
  const al = averageLoss(pnls);
  return wr * aw + (1 - wr) * al;
}

export function profitFactorFromPnls(pnls: number[]): number {
  const gp = grossProfit(pnls);
  const gl = grossLoss(pnls);
  const denom = Math.abs(gl);
  if (denom < 1e-12) return gp > 0 ? Infinity : 0;
  return gp / denom;
}

/** Period returns as decimals (e.g. 0.01 = 1%). Uses sample std-dev (ddof=1). Annualized with √252. */
export function sharpeRatio(dailyReturns: number[], riskFreeDaily = 0): number {
  const xs = dailyReturns.filter((x) => Number.isFinite(x));
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length - riskFreeDaily;
  const variance =
    xs.reduce((acc, x) => acc + (x - mean - riskFreeDaily) ** 2, 0) / Math.max(xs.length - 1, 1);
  const sd = Math.sqrt(Math.max(variance, 1e-18));
  if (sd < 1e-12) return 0;
  return (mean / sd) * Math.sqrt(252);
}

/** Max drawdown USD from cumulative PnL peaks (per-trade or bucket series). */
export function maxDrawdown(equitySeries: number[]): { pct: number; usd: number } {
  let peak = -Infinity;
  let maxDdUsd = 0;
  let maxDdPct = 0;
  for (const eq of equitySeries) {
    if (eq > peak) peak = eq;
    const ddUsd = peak - eq;
    const denom = Math.max(Math.abs(peak), 1e-9);
    const ddPct = (ddUsd / denom) * 100;
    if (ddUsd > maxDdUsd) {
      maxDdUsd = ddUsd;
      maxDdPct = ddPct;
    }
  }
  return { pct: maxDdPct, usd: maxDdUsd };
}

/** Cumulative realized PnL after each closed trade (chronological). */
export function cumulativeEquityFromPnls(pnls: number[]): number[] {
  let cum = 0;
  const out: number[] = [];
  for (const p of pnls) {
    cum += p;
    out.push(cum);
  }
  return out;
}

/** Drawdown % relative to portfolio NAV — interpretabil ca „cât din cont ai pierdut la maxim față de vârf”. */
export function drawdownPercentVsNav(drawdownUsd: number, portfolioNavUsd: number, floorUsd = 10): number {
  const nav = Math.max(Math.abs(portfolioNavUsd), floorUsd);
  return (Math.max(0, drawdownUsd) / nav) * 100;
}

export function currentDrawdown(equitySeries: number[]): { pct: number; usd: number } {
  if (!equitySeries.length) return { pct: 0, usd: 0 };
  let peak = -Infinity;
  let lastPeak = -Infinity;
  let troughFromLastPeak = equitySeries[0];
  for (const eq of equitySeries) {
    if (eq >= peak) {
      peak = eq;
      lastPeak = eq;
      troughFromLastPeak = eq;
    } else {
      troughFromLastPeak = Math.min(troughFromLastPeak, eq);
    }
  }
  const eqEnd = equitySeries[equitySeries.length - 1];
  const ddUsd = lastPeak - eqEnd;
  const denom = Math.max(Math.abs(lastPeak), 1e-9);
  return { pct: (ddUsd / denom) * 100, usd: ddUsd };
}

export function recoveryFactor(netPnL: number, maxDdUsd: number): number {
  if (maxDdUsd < 1e-9) return netPnL > 0 ? Infinity : 0;
  return netPnL / maxDdUsd;
}

export function averageHoldingTimeMinutes(durations: number[]): number {
  const finite = durations.filter((d) => Number.isFinite(d) && d >= 0);
  if (!finite.length) return 0;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

export function longestWinningStreak(pnls: number[]): number {
  let cur = 0;
  let best = 0;
  for (const p of pnls) {
    if (p > 0) {
      cur += 1;
      best = Math.max(best, cur);
    } else cur = 0;
  }
  return best;
}

export function longestLosingStreak(pnls: number[]): number {
  let cur = 0;
  let best = 0;
  for (const p of pnls) {
    if (p < 0) {
      cur += 1;
      best = Math.max(best, cur);
    } else cur = 0;
  }
  return best;
}

/**
 * Raw “return” from cumulative equity curve (PnL drept numărător). Poate exploda dacă equity înainte de perioadă ≈ 0.
 * Preferă `calendarPeriodReturnPercent` pentru randamente calendaristice afișate în UI.
 */
export function monthlyReturn(equityBeforeMonth: number, equityEndOfWindow: number): number {
  const base = Math.max(Math.abs(equityBeforeMonth), 1e-6);
  return ((equityEndOfWindow - equityBeforeMonth) / base) * 100;
}

/**
 * Randament calendaristic interpretabil: PnL în perioadă față de o bază care nu poate fi „praf”.
 * Bază = max(|equity realizat înainte de perioadă|, max notional tranzacții în perioadă, planșă din setări).
 */
export function calendarPeriodReturnPercent(
  equityBefore: number,
  pnlInPeriod: number,
  maxDeployedNotionalInPeriod: number,
  basisFloorUsd: number
): { pct: number; basisUsd: number } {
  const floor = Number.isFinite(basisFloorUsd) && basisFloorUsd > 0 ? basisFloorUsd : 10;
  const basisUsd = Math.max(Math.abs(equityBefore), Math.max(0, maxDeployedNotionalInPeriod), floor);
  return { pct: (pnlInPeriod / basisUsd) * 100, basisUsd };
}

/** Randament simplu: PnL în perioadă față de valoarea curentă a portofoliului (nu NAV istoric). */
export function portfolioPeriodReturnPercent(pnlInPeriod: number, portfolioNavUsd: number): number {
  if (!Number.isFinite(portfolioNavUsd) || portfolioNavUsd <= 0) return 0;
  return (pnlInPeriod / portfolioNavUsd) * 100;
}

/** Daily simple returns from bucketed equity increments: r_t = Δequity / max(|equity_{t-1}|, ε). */
export function dailyReturnsFromBuckets(dailyPnls: number[], cumulativePrior = 0): { date: string; ret: number; pnl: number }[] {
  const out: { date: string; ret: number; pnl: number }[] = [];
  let cum = cumulativePrior;
  let i = 0;
  for (const pnl of dailyPnls) {
    const denom = Math.max(Math.abs(cum), 1e-6);
    const ret = pnl / denom;
    cum += pnl;
    out.push({ date: `d${i++}`, ret, pnl });
  }
  return out;
}

/** Fee drag vs gross absolute PnL movement (profit + loss magnitudes). */
export function feesPercentage(totalFees: number, grossProfitVal: number, grossLossVal: number): number {
  const denom = Math.abs(grossProfitVal) + Math.abs(grossLossVal);
  if (denom < 1e-9) return totalFees > 0 ? 100 : 0;
  return (totalFees / denom) * 100;
}

// ─── Mongo helpers ───

export function strategyExpr() {
  return {
    $trim: {
      input: {
        $toString: {
          $ifNull: ["$strategy", { $ifNull: ["$aiModel", "Unspecified"] }],
        },
      },
    },
  };
}

export function pnlExpr() {
  return { $ifNull: ["$pnlUsdc", { $ifNull: ["$pnl", 0] }] };
}

export function feeExpr() {
  return { $ifNull: ["$fee", 0] };
}

export function durationMinutesExpr() {
  return {
    $cond: [
      { $and: [{ $ne: ["$closedAt", null] }, { $ne: ["$openedAt", null] }] },
      { $divide: [{ $subtract: ["$closedAt", "$openedAt"] }, 60000] },
      {
        $cond: [
          { $and: [{ $ne: ["$closedAt", null] }, { $ne: ["$createdAt", null] }] },
          { $divide: [{ $subtract: ["$closedAt", "$createdAt"] }, 60000] },
          null,
        ],
      },
    ],
  };
}

export function buildClosedAnalyticsMatch(filters: AnalyticsFilters): FilterQuery<TradeDoc> {
  const m: FilterQuery<TradeDoc> = {
    ...dashboardClosedTradeMatch(filters.userId),
  };

  const ca: Record<string, Date> = {};
  if (filters.from) ca.$gte = filters.from;
  if (filters.to) ca.$lte = filters.to;
  if (Object.keys(ca).length) Object.assign(m, { closedAt: ca });

  if (filters.pair && filters.pair !== "__all__") {
    (m as any).pair = filters.pair;
  }

  if (filters.strategy && filters.strategy !== "__all__") {
    const s = filters.strategy;
    (m as any).$and = [...(((m as any).$and as any[]) || [])];
    (m as any).$and.push({
      $or: [{ aiModel: s }, { strategy: s }],
    });
  }

  return m;
}

export function buildBaselineClosedMatch(
  filters: Pick<AnalyticsFilters, "userId" | "pair" | "strategy">
): FilterQuery<TradeDoc> {
  const m: FilterQuery<TradeDoc> = { ...dashboardClosedTradeMatch(filters.userId) };
  if (filters.pair && filters.pair !== "__all__") (m as any).pair = filters.pair;
  if (filters.strategy && filters.strategy !== "__all__") {
    const s = filters.strategy;
    (m as any).$and = [...(((m as any).$and as any[]) || [])];
    (m as any).$and.push({ $or: [{ aiModel: s }, { strategy: s }] });
  }
  return m;
}

function timeframeUnit(tf: AnalyticsTimeframe): "day" | "week" | "month" {
  if (tf === "weekly") return "week";
  if (tf === "monthly") return "month";
  return "day";
}

export function parseAnalyticsSearchParams(
  sp: URLSearchParams
): Omit<AnalyticsFilters, "userId"> {
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  const pair = sp.get("pair") || null;
  const strategy = sp.get("strategy") || null;
  const tf = (sp.get("timeframe") || "daily").toLowerCase();
  const timeframe: AnalyticsTimeframe =
    tf === "weekly" || tf === "monthly" ? tf : "daily";
  const timezone = sp.get("timezone") || "UTC";
  const includeOpenInRecent = sp.get("includeOpen") === "1" || sp.get("includeOpen") === "true";
  return { from, to, pair, strategy, timeframe, timezone, includeOpenInRecent };
}

function labelBucket(d: Date, tf: AnalyticsTimeframe): string {
  if (tf === "monthly") return d.toISOString().slice(0, 7);
  if (tf === "weekly") {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+x - +yearStart) / 86400000 + 1) / 7);
    return `${x.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }
  return d.toISOString().slice(0, 10);
}

function buildInsights(
  m: AnalyticsMetrics,
  baselineWinRate: number,
  top: PairAggRow | undefined,
  worst: PairAggRow | undefined
): AnalyticsInsights {
  const bullets: string[] = [];
  let severity: AnalyticsInsights["severity"] = "info";

  if (top && top.pnl > 0) {
    bullets.push(`Best performing pair: ${top.pair} (${top.pnl.toFixed(2)} USDC net over ${top.trades} trades).`);
  }
  if (worst && worst.pnl < 0) {
    bullets.push(`Worst performing pair: ${worst.pair} (${worst.pnl.toFixed(2)} USDC net over ${worst.trades} trades).`);
  }
  if (m.maxDrawdownPct > 20) {
    bullets.push(`Risk: max drawdown exceeds 20% (${m.maxDrawdownPct.toFixed(1)}%). Consider reducing size or tightening risk.`);
    severity = "critical";
  } else if (m.maxDrawdownPct > 12) {
    bullets.push(`Elevated drawdown (${m.maxDrawdownPct.toFixed(1)}%) — monitor exposure and correlation.`);
    severity = "warning";
  }
  if (m.tradeCount >= 10 && baselineWinRate > 0 && m.winRate + 1e-6 < baselineWinRate - 0.05) {
    bullets.push(
      `Win rate (${(m.winRate * 100).toFixed(1)}%) is materially below your historical average (${(baselineWinRate * 100).toFixed(1)}%) for the same filters.`
    );
    if (severity !== "critical") severity = "warning";
  }
  if (m.profitFactor < 1 && m.tradeCount >= 5) {
    bullets.push(`Profit factor is below 1 — gross losses outweigh gross profits; review exits and fees.`);
    if (severity !== "critical") severity = "warning";
  }
  if (m.expectancy > 0 && m.sharpeRatio < 0.5 && m.tradeCount >= 15) {
    bullets.push(`Positive expectancy but low Sharpe — return volatility is high relative to daily mean; consider smoothing position sizing.`);
  }
  if (m.totalFees > 0 && m.feesPercentage > 15) {
    bullets.push(`Fees represent ${m.feesPercentage.toFixed(1)}% of gross PnL movement — watch fee drag on high-frequency strategies.`);
  }
  if (!bullets.length) {
    bullets.push("No strong signals yet — extend the sample or narrow filters for more actionable stats.");
  }
  return { bullets, severity };
}

export async function computeAnalyticsReport(filters: AnalyticsFilters): Promise<AnalyticsReport> {
  const matchClosed = buildClosedAnalyticsMatch(filters) as Record<string, unknown>;
  const baselineMatch = buildBaselineClosedMatch(filters) as Record<string, unknown>;

  const unit = timeframeUnit(filters.timeframe);

  const facet = await Trade.aggregate(
    [
    { $match: matchClosed },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              tradeCount: { $sum: 1 },
              totalNetPnL: { $sum: pnlExpr() },
              grossProfit: { $sum: { $cond: [{ $gt: [pnlExpr(), 0] }, pnlExpr(), 0] } },
              grossLoss: { $sum: { $cond: [{ $lt: [pnlExpr(), 0] }, pnlExpr(), 0] } },
              wins: { $sum: { $cond: [{ $gt: [pnlExpr(), 0] }, 1, 0] } },
              losses: { $sum: { $cond: [{ $lt: [pnlExpr(), 0] }, 1, 0] } },
              totalFees: { $sum: feeExpr() },
              avgWin: { $avg: { $cond: [{ $gt: [pnlExpr(), 0] }, pnlExpr(), null] } },
              avgLoss: { $avg: { $cond: [{ $lt: [pnlExpr(), 0] }, pnlExpr(), null] } },
              avgTradePct: { $avg: { $ifNull: ["$pnlPercent", 0] } },
              avgHold: { $avg: durationMinutesExpr() },
            },
          },
        ],
        buckets: [
          {
            $project: {
              b: { $dateTrunc: { date: "$closedAt", unit, timezone: filters.timezone || "UTC" } },
              pnl: pnlExpr(),
            },
          },
          { $group: { _id: "$b", pnl: { $sum: "$pnl" } } },
          { $sort: { _id: 1 } },
          {
            $setWindowFields: {
              sortBy: { _id: 1 },
              output: {
                equity: { $sum: "$pnl", window: { documents: ["unbounded", "current"] } },
              },
            },
          },
        ],
        byPair: [
          {
            $group: {
              _id: "$pair",
              pnl: { $sum: pnlExpr() },
              trades: { $sum: 1 },
              wins: { $sum: { $cond: [{ $gt: [pnlExpr(), 0] }, 1, 0] } },
              losses: { $sum: { $cond: [{ $lt: [pnlExpr(), 0] }, 1, 0] } },
            },
          },
          { $sort: { pnl: -1 } },
        ],
        byStrategy: [
          {
            $group: {
              _id: strategyExpr(),
              pnl: { $sum: pnlExpr() },
              trades: { $sum: 1 },
              wins: { $sum: { $cond: [{ $gt: [pnlExpr(), 0] }, 1, 0] } },
              losses: { $sum: { $cond: [{ $lt: [pnlExpr(), 0] }, 1, 0] } },
              grossProfitS: { $sum: { $cond: [{ $gt: [pnlExpr(), 0] }, pnlExpr(), 0] } },
              grossLossS: { $sum: { $cond: [{ $lt: [pnlExpr(), 0] }, pnlExpr(), 0] } },
              avgTradePct: { $avg: { $ifNull: ["$pnlPercent", 0] } },
              avgWinS: { $avg: { $cond: [{ $gt: [pnlExpr(), 0] }, pnlExpr(), null] } },
              avgLossS: { $avg: { $cond: [{ $lt: [pnlExpr(), 0] }, pnlExpr(), null] } },
            },
          },
          { $sort: { pnl: -1 } },
        ],
        histogram: [
          {
            $bucketAuto: {
              groupBy: pnlExpr(),
              buckets: 14,
              output: { count: { $sum: 1 }, netPnl: { $sum: pnlExpr() } },
            },
          },
        ],
        orderedPnls: [{ $sort: { closedAt: 1 } }, { $project: { _id: 0, p: pnlExpr(), d: durationMinutesExpr() } }],
        recentClosed: [
          { $sort: { closedAt: -1 } },
          { $limit: 80 },
          {
            $project: {
              _id: 1,
              pair: 1,
              side: 1,
              entryPrice: 1,
              exitPrice: 1,
              quantity: 1,
              pnlUsdc: pnlExpr(),
              pnlPercent: 1,
              fee: feeExpr(),
              aiModel: 1,
              strategy: 1,
              status: 1,
              openedAt: 1,
              closedAt: 1,
              dm: durationMinutesExpr(),
            },
          },
        ],
      },
    },
    ],
    { allowDiskUse: true }
  );

  const f = facet[0] || {};
  const sum = (f.summary || [])[0] || {};

  const baselineAgg = await Trade.aggregate([
    { $match: baselineMatch },
    {
      $group: {
        _id: null,
        n: { $sum: 1 },
        wins: { $sum: { $cond: [{ $gt: [pnlExpr(), 0] }, 1, 0] } },
      },
    },
  ]);
  const bl = baselineAgg[0];
  const baselineTradeCount = bl?.n ?? 0;
  const baselineWinRate = baselineTradeCount ? (bl.wins || 0) / baselineTradeCount : 0;

  const distinctPairs = await Trade.distinct("pair", { ...dashboardClosedTradeMatch(filters.userId) });
  const distinctStrategies = await Trade.aggregate([
    { $match: dashboardClosedTradeMatch(filters.userId) },
    { $group: { _id: strategyExpr() } },
    { $sort: { _id: 1 } },
  ]);

  const pnlsOrdered = (f.orderedPnls || []).map((x: any) => x.p as number);
  const dursOrdered = (f.orderedPnls || []).map((x: any) => x.d as number).filter((x: number) => x != null && Number.isFinite(x));

  const tradeCount = sum.tradeCount ?? 0;
  const totalNet = sum.totalNetPnL ?? 0;
  const gp = sum.grossProfit ?? 0;
  const gl = sum.grossLoss ?? 0;
  const wins = sum.wins ?? 0;
  const wr = tradeCount ? wins / tradeCount : 0;
  const avgWinVal = sum.avgWin ?? 0;
  const avgLossVal = sum.avgLoss ?? 0;
  const totalFees = sum.totalFees ?? 0;

  const expectancyVal = expectancy(pnlsOrdered);
  const pf = profitFactorFromPnls(pnlsOrdered);

  const settings = await getSettings(filters.userId);
  const returnBasisFloorUsd = Math.max(10, Number(settings.maxUsdcPerOrder) || 50);

  let portfolioDenominatorUsd = Number(settings.cashBalanceUsdc) || 0;
  let portfolioDenominatorSource: "live" | "snapshot" = "snapshot";
  try {
    const pv = await fetchPortfolioValueUsdc(settings.binanceTestnet);
    portfolioDenominatorUsd = pv.total;
    portfolioDenominatorSource = "live";
  } catch {
    portfolioDenominatorUsd = Number(settings.cashBalanceUsdc) || 0;
    portfolioDenominatorSource = "snapshot";
  }

  const portfolioSnapTs =
    settings.cashBalanceUpdatedAt instanceof Date
      ? settings.cashBalanceUpdatedAt.toISOString()
      : settings.cashBalanceUpdatedAt
        ? new Date(settings.cashBalanceUpdatedAt as string | number).toISOString()
        : null;

  const ddNavFloor = Math.max(returnBasisFloorUsd, portfolioDenominatorUsd);

  const tradeEquitySeries = cumulativeEquityFromPnls(pnlsOrdered);
  const { usd: maxDdUsd } = maxDrawdown(tradeEquitySeries.length ? tradeEquitySeries : [0]);
  const curDd = currentDrawdown(tradeEquitySeries.length ? tradeEquitySeries : [0]);
  const maxDdPct = drawdownPercentVsNav(maxDdUsd, ddNavFloor);
  const curDdPct = drawdownPercentVsNav(curDd.usd, ddNavFloor);
  const rf = recoveryFactor(totalNet, maxDdUsd);

  const buckets: BucketBarPoint[] = (f.buckets || []).map((row: any) => ({
    ts: row._id ? new Date(row._id).getTime() : 0,
    label: row._id ? labelBucket(new Date(row._id), filters.timeframe) : "",
    pnl: row.pnl ?? 0,
  }));

  const equityCurve: EquityPoint[] = (f.buckets || []).map((row: any) => ({
    ts: row._id ? new Date(row._id).getTime() : 0,
    label: row._id ? labelBucket(new Date(row._id), filters.timeframe) : "",
    equity: row.equity ?? 0,
  }));

  let peak = -Infinity;
  const drawdownCurve: DrawdownPoint[] = equityCurve.map((pt) => {
    if (pt.equity > peak) peak = pt.equity;
    const ddUsd = peak - pt.equity;
    return {
      ts: pt.ts,
      label: pt.label,
      ddPct: drawdownPercentVsNav(ddUsd, ddNavFloor),
      ddUsd,
      equity: pt.equity,
    };
  });

  const dailyPnlsOnly = buckets.map((b) => b.pnl);
  const dailyRetObjs = dailyReturnsFromBuckets(dailyPnlsOnly, 0).map((o, i) => ({
    ...o,
    date: buckets[i]?.label ?? o.date,
  }));
  const sharpe = sharpeRatio(dailyRetObjs.map((x) => x.ret));

  const tz = filters.timezone || "UTC";
  const anchor = filters.to ?? new Date();
  const baselineOnly = buildBaselineClosedMatch(filters) as Record<string, unknown>;

  const weekStart = startOfIsoWeekMondayInTz(anchor, tz);
  const weekEndExc = addSevenDaysWallMonday(weekStart, tz);
  const monthStartTz = startOfCalendarMonthInTz(anchor, tz);
  const monthEndExc = startOfNextCalendarMonthInTz(anchor, tz);
  const yearStartTz = startOfCalendarYearInTz(anchor, tz);
  const yearEndExc = startOfNextCalendarYearInTz(anchor, tz);

  const upperWeek = new Date(Math.min(anchor.getTime(), weekEndExc.getTime() - 1));
  const upperMonth = new Date(Math.min(anchor.getTime(), monthEndExc.getTime() - 1));
  const upperYear = new Date(Math.min(anchor.getTime(), yearEndExc.getTime() - 1));

  const closedAtExists = { $exists: true, $ne: null };

  async function aggregateSumClosedPnl(match: Record<string, unknown>): Promise<number> {
    const rows = await Trade.aggregate(
      [{ $match: match }, { $group: { _id: null, s: { $sum: pnlExpr() } } }],
      { allowDiskUse: true }
    );
    return rows[0]?.s ?? 0;
  }

  async function aggregatePeriodDeployedAndPnl(
    startInclusive: Date,
    endInclusive: Date
  ): Promise<{ pnl: number; maxNotional: number }> {
    const match = {
      ...baselineOnly,
      closedAt: { ...closedAtExists, $gte: startInclusive, $lte: endInclusive },
    };
    const notionField = {
      $ifNull: [
        "$usdcValue",
        {
          $multiply: [{ $ifNull: ["$entryPrice", 0] }, { $abs: { $ifNull: ["$quantity", 0] } }],
        },
      ],
    };
    const rows = await Trade.aggregate(
      [
        { $match: match },
        {
          $facet: {
            pnl: [{ $group: { _id: null, s: { $sum: pnlExpr() } } }],
            mx: [{ $group: { _id: null, v: { $max: notionField } } }],
          },
        },
      ],
      { allowDiskUse: true }
    );
    const r = rows[0];
    return {
      pnl: r?.pnl?.[0]?.s ?? 0,
      maxNotional: Math.max(0, Number(r?.mx?.[0]?.v) || 0),
    };
  }

  const [equityBeforeWeek, equityBeforeMonthTz, equityBeforeYear, weekWin, monthWin, yearWin] = await Promise.all([
    aggregateSumClosedPnl({ ...baselineOnly, closedAt: { ...closedAtExists, $lt: weekStart } }),
    aggregateSumClosedPnl({ ...baselineOnly, closedAt: { ...closedAtExists, $lt: monthStartTz } }),
    aggregateSumClosedPnl({ ...baselineOnly, closedAt: { ...closedAtExists, $lt: yearStartTz } }),
    aggregatePeriodDeployedAndPnl(weekStart, upperWeek),
    aggregatePeriodDeployedAndPnl(monthStartTz, upperMonth),
    aggregatePeriodDeployedAndPnl(yearStartTz, upperYear),
  ]);

  const weeklyPortfolioRet = portfolioPeriodReturnPercent(weekWin.pnl, portfolioDenominatorUsd);
  const monthlyPortfolioRet = portfolioPeriodReturnPercent(monthWin.pnl, portfolioDenominatorUsd);
  const yearlyPortfolioRet = portfolioPeriodReturnPercent(yearWin.pnl, portfolioDenominatorUsd);

  const wRet = calendarPeriodReturnPercent(
    equityBeforeWeek,
    weekWin.pnl,
    weekWin.maxNotional,
    returnBasisFloorUsd
  );
  const mRet = calendarPeriodReturnPercent(
    equityBeforeMonthTz,
    monthWin.pnl,
    monthWin.maxNotional,
    returnBasisFloorUsd
  );
  const yRet = calendarPeriodReturnPercent(equityBeforeYear, yearWin.pnl, yearWin.maxNotional, returnBasisFloorUsd);

  const weeklyRet = wRet.pct;
  const monthlyRet = mRet.pct;
  const yearlyRet = yRet.pct;

  const feesPct = feesPercentage(totalFees, gp, gl);

  const metrics: AnalyticsMetrics = {
    totalNetPnL: totalNet,
    grossProfit: gp,
    grossLoss: gl,
    winRate: wr,
    averageWin: avgWinVal || averageWin(pnlsOrdered),
    averageLoss: avgLossVal || averageLoss(pnlsOrdered),
    expectancy: expectancyVal,
    profitFactor: Number.isFinite(pf) ? pf : pf === Infinity ? 999 : 0,
    sharpeRatio: sharpe,
    maxDrawdownPct: maxDdPct,
    maxDrawdownUsd: maxDdUsd,
    currentDrawdownPct: curDdPct,
    currentDrawdownUsd: curDd.usd,
    recoveryFactor: Number.isFinite(rf) ? rf : rf === Infinity ? 999 : 0,
    averageHoldingMinutes: sum.avgHold ?? averageHoldingTimeMinutes(dursOrdered),
    longestWinningStreak: longestWinningStreak(pnlsOrdered),
    longestLosingStreak: longestLosingStreak(pnlsOrdered),
    weeklyReturnPct: weeklyRet,
    monthlyReturnPct: monthlyRet,
    yearlyReturnPct: yearlyRet,
    weeklyPeriodPnlUsd: weekWin.pnl,
    monthlyPeriodPnlUsd: monthWin.pnl,
    yearlyPeriodPnlUsd: yearWin.pnl,
    weeklyReturnBasisUsd: wRet.basisUsd,
    monthlyReturnBasisUsd: mRet.basisUsd,
    yearlyReturnBasisUsd: yRet.basisUsd,
    portfolioDenominatorUsd: portfolioDenominatorUsd,
    portfolioDenominatorSource,
    portfolioSnapshotUpdatedAt: portfolioDenominatorSource === "snapshot" ? portfolioSnapTs : null,
    weeklyPortfolioReturnPct: weeklyPortfolioRet,
    monthlyPortfolioReturnPct: monthlyPortfolioRet,
    yearlyPortfolioReturnPct: yearlyPortfolioRet,
    dailyReturns: dailyRetObjs,
    feesPercentage: feesPct,
    totalFees,
    tradeCount,
    avgTradeReturnPct: sum.avgTradePct ?? 0,
  };

  const byPair: PairAggRow[] = (f.byPair || []).map((r: any) => ({
    pair: r._id || "—",
    pnl: r.pnl ?? 0,
    trades: r.trades ?? 0,
    wins: r.wins ?? 0,
    losses: r.losses ?? 0,
  }));
  const topPairs = [...byPair].sort((a, b) => b.pnl - a.pnl).slice(0, 10);
  const worstPairs = [...byPair].sort((a, b) => a.pnl - b.pnl).slice(0, 10);

  const strategyPerformance: StrategyAggRow[] = (f.byStrategy || []).map((r: any) => ({
    strategy: r._id || "Unspecified",
    pnl: r.pnl ?? 0,
    trades: r.trades ?? 0,
    wins: r.wins ?? 0,
    losses: r.losses ?? 0,
    avgTradePct: r.avgTradePct ?? 0,
  }));

  const strategyBreakdown: StrategyBreakdownRow[] = (f.byStrategy || []).map((r: any) => {
    const trades = r.trades ?? 0;
    const wins = r.wins ?? 0;
    const losses = r.losses ?? 0;
    const wrs = trades ? wins / trades : 0;
    const gpS = r.grossProfitS ?? 0;
    const glS = r.grossLossS ?? 0;
    const pfS = Math.abs(glS) < 1e-12 ? (gpS > 0 ? Infinity : 0) : gpS / Math.abs(glS);
    const pfSafe = Number.isFinite(pfS) ? pfS : pfS === Infinity ? 999 : 0;
    return {
      strategy: r._id || "Unspecified",
      trades,
      wins,
      losses,
      winRate: wrs,
      pnl: r.pnl ?? 0,
      avgWin: r.avgWinS ?? 0,
      avgLoss: r.avgLossS ?? 0,
      profitFactor: pfSafe,
    };
  });

  const winLossHistogram: HistogramBin[] = (f.histogram || []).map((h: any) => ({
    start: h._id?.min ?? 0,
    end: h._id?.max ?? 0,
    count: h.count ?? 0,
    netPnl: h.netPnl ?? 0,
  }));

  function rowToRecent(r: any): RecentTradeRow {
    const strat =
      typeof r.strategy === "string" && r.strategy.trim()
        ? r.strategy
        : typeof r.aiModel === "string" && r.aiModel.trim()
          ? r.aiModel
          : "Unspecified";
    const pnlRaw = r.pnlUsdc ?? r.pnl ?? null;
    return {
      id: String(r._id),
      symbol: r.pair ?? "—",
      side: r.side ?? "BUY",
      entryPrice: r.entryPrice ?? null,
      exitPrice: r.exitPrice ?? null,
      quantity: r.quantity ?? null,
      pnl: pnlRaw != null ? +pnlRaw : null,
      pnlPercent: r.pnlPercent != null ? +r.pnlPercent : null,
      fee: r.fee != null ? +r.fee : null,
      strategy: strat,
      status: r.status ?? "CLOSED",
      closedAt: r.closedAt ? new Date(r.closedAt).toISOString() : null,
      openedAt: r.openedAt ? new Date(r.openedAt).toISOString() : null,
      durationMinutes: r.dm != null ? +r.dm : null,
    };
  }

  let recentTrades: RecentTradeRow[] = (f.recentClosed || []).map(rowToRecent);

  if (filters.includeOpenInRecent) {
    const openMatch: FilterQuery<TradeDoc> = { userId: filters.userId, status: "OPEN" };
    if (filters.pair && filters.pair !== "__all__") (openMatch as any).pair = filters.pair;
    if (filters.strategy && filters.strategy !== "__all__") {
      const s = filters.strategy;
      (openMatch as any).$and = [...(((openMatch as any).$and as any[]) || [])];
      (openMatch as any).$and.push({ $or: [{ aiModel: s }, { strategy: s }] });
    }
    const openRows = await Trade.find(openMatch)
      .sort({ openedAt: -1 })
      .limit(80)
      .select({
        pair: 1,
        side: 1,
        entryPrice: 1,
        exitPrice: 1,
        quantity: 1,
        pnlUsdc: 1,
        pnlPercent: 1,
        fee: 1,
        aiModel: 1,
        strategy: 1,
        status: 1,
        openedAt: 1,
        closedAt: 1,
      })
      .lean();

    const openMapped = openRows.map((r: any) =>
      rowToRecent({
        ...r,
        fee: r.fee ?? null,
        dm: null,
        pnlUsdc: null,
        status: "OPEN",
      })
    );

    const byTs = (x: RecentTradeRow) => Math.max(new Date(x.closedAt || 0).getTime(), new Date(x.openedAt || 0).getTime());
    recentTrades = [...recentTrades, ...openMapped].sort((a, b) => byTs(b) - byTs(a)).slice(0, 50);
  } else {
    recentTrades = recentTrades.slice(0, 50);
  }

  const insights = buildInsights(metrics, baselineWinRate, topPairs[0], worstPairs[0]);

  const filterOptions = {
    pairs: (distinctPairs as string[]).filter(Boolean).sort(),
    strategies: distinctStrategies.map((x: any) => x._id as string).filter(Boolean),
  };

  return {
    filters,
    metrics,
    equityCurve,
    drawdownCurve,
    timeframePnL: buckets,
    winLossHistogram,
    pnlByPair: byPair,
    strategyPerformance,
    topPairs,
    worstPairs,
    recentTrades,
    strategyBreakdown,
    baselineWinRate,
    baselineTradeCount,
    insights,
    filterOptions,
  };
}