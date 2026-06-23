/** Client-safe types & constants for long-term portfolio (no Node/Mongo imports). */

/** Sub this USDC notional, non-target holdings are hidden as dust (matches dashboard). */
export const PORTFOLIO_DUST_MAX_USDC = 1;

export type InvestTarget = { asset: string; weightPct: number };

export const DEFAULT_TARGETS: InvestTarget[] = [
  { asset: "BTC", weightPct: 35 },
  { asset: "ETH", weightPct: 25 },
  { asset: "BNB", weightPct: 10 },
  { asset: "SOL", weightPct: 10 },
  { asset: "USDC", weightPct: 20 },
];

export type PortfolioHolding = {
  asset: string;
  qty: number;
  price: number;
  valueUsdc: number;
  currentWeightPct: number;
  targetWeightPct: number;
  driftPct: number;
  inTradingQty: number;
  investableQty: number;
  isStable: boolean;
};

export type RebalanceAction = {
  asset: string;
  action: "BUY" | "SELL";
  suggestedUsdc: number;
  driftPct: number;
  currentWeightPct: number;
  targetWeightPct: number;
  reason: string;
};

export type PortfolioSnapshot = {
  totalUsdc: number;
  investableUsdc: number;
  tradingLockedUsdc: number;
  updatedAt: string;
  tickerOk: boolean;
  portfolioError: string | null;
  maxDriftPct: number;
  needsRebalance: boolean;
  holdings: PortfolioHolding[];
  rebalancePlan: RebalanceAction[];
  /** Non-target balances hidden as dust (under 1 USDC). */
  dustHiddenCount: number;
};

/** Hide tiny non-target balances; always keep configured allocation targets visible. */
export function isPortfolioDust(h: PortfolioHolding): boolean {
  if (h.targetWeightPct > 0) return false;
  if (h.valueUsdc >= PORTFOLIO_DUST_MAX_USDC) return false;
  return h.valueUsdc > 0 || h.qty > 0;
}

export function filterPortfolioHoldings(holdings: PortfolioHolding[]): PortfolioHolding[] {
  return holdings.filter((h) => !isPortfolioDust(h));
}

export type PortfolioAiAdvice = {
  summary: string;
  rebalanceUrgency: "LOW" | "MEDIUM" | "HIGH";
  recommendations: {
    asset: string;
    action: "BUY" | "SELL" | "HOLD";
    suggestedUsdc?: number;
    reason: string;
  }[];
  investmentIdeas: {
    asset: string;
    action: "CONSIDER_BUY" | "CONSIDER_SELL" | "WATCH";
    suggestedAllocationPct?: number;
    horizon?: string;
    reason: string;
  }[];
  riskNotes: string[];
  provider?: string;
  model?: string;
  generatedAt: string;
};

export type InvestPortfolioView = {
  name: string;
  rebalanceThresholdPct: number;
  targets: InvestTarget[];
  snapshot: PortfolioSnapshot;
  lastAiAdvice: PortfolioAiAdvice | null;
  lastAiAdviceAt: string | null;
};
