import { connectDB } from "./db";
import { InvestPortfolio } from "@/models/InvestPortfolio";
import { Trade } from "@/models/Trade";
import { baseAssetOf, fetchPortfolioValueUsdc } from "./binance";
import { getSettings, syncToEnv, type RuntimeSettings } from "./settings";
import { callAI, safeParseJson, assertAiReady } from "./ai";
import { toObjectId } from "./tenant";
import {
  DEFAULT_TARGETS,
  filterPortfolioHoldings,
  isPortfolioDust,
  type InvestTarget,
  type PortfolioAiAdvice,
  type PortfolioHolding,
  type PortfolioSnapshot,
  type InvestPortfolioView,
  type RebalanceAction,
} from "./investPortfolioTypes";

export {
  DEFAULT_TARGETS,
  PORTFOLIO_DUST_MAX_USDC,
  filterPortfolioHoldings,
  isPortfolioDust,
  type InvestTarget,
  type PortfolioAiAdvice,
  type PortfolioHolding,
  type PortfolioSnapshot,
  type InvestPortfolioView,
  type RebalanceAction,
} from "./investPortfolioTypes";

const STABLES = new Set(["USDC", "USDT", "BUSD", "FDUSD", "TUSD", "DAI", "USDP", "PYUSD"]);

function normalizeTargets(targets: InvestTarget[]): InvestTarget[] {
  const map = new Map<string, number>();
  for (const t of targets) {
    const asset = t.asset.trim().toUpperCase();
    if (!asset || !Number.isFinite(t.weightPct) || t.weightPct <= 0) continue;
    map.set(asset, (map.get(asset) || 0) + t.weightPct);
  }
  const rows = [...map.entries()].map(([asset, weightPct]) => ({ asset, weightPct }));
  const sum = rows.reduce((a, r) => a + r.weightPct, 0);
  if (sum <= 0) return [...DEFAULT_TARGETS];
  return rows.map((r) => ({ asset: r.asset, weightPct: +((r.weightPct / sum) * 100).toFixed(2) }));
}

export async function getOrCreateInvestPortfolio(userId: string) {
  await connectDB();
  const uid = toObjectId(userId);
  let doc = await InvestPortfolio.findOne({ userId: uid });
  if (!doc) {
    doc = await InvestPortfolio.create({
      userId: uid,
      targets: DEFAULT_TARGETS,
      rebalanceThresholdPct: 5,
    });
  } else if (!doc.targets?.length) {
    doc.targets = DEFAULT_TARGETS as any;
    await doc.save();
  }
  return doc;
}

export async function updateInvestPortfolio(
  userId: string,
  patch: { name?: string; rebalanceThresholdPct?: number; targets?: InvestTarget[] }
) {
  await connectDB();
  const doc = await getOrCreateInvestPortfolio(userId);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name) doc.name = name;
  }
  if (patch.rebalanceThresholdPct !== undefined) {
    doc.rebalanceThresholdPct = Math.min(25, Math.max(1, patch.rebalanceThresholdPct));
  }
  if (patch.targets !== undefined) {
    doc.targets = normalizeTargets(patch.targets) as any;
  }
  await doc.save();
  return doc;
}

async function tradingQtyByAsset(userId: string): Promise<Map<string, number>> {
  const open = await Trade.find({ userId: toObjectId(userId), status: "OPEN" }).lean();
  const map = new Map<string, number>();
  for (const t of open) {
    const base = baseAssetOf(String(t.pair || ""));
    const qty = +(t.quantity || 0);
    if (qty > 0) map.set(base, (map.get(base) || 0) + qty);
  }
  return map;
}

function mergeHoldings(
  assets: { asset: string; qty: number; price: number; valueUsdc: number }[],
  targets: InvestTarget[],
  tradingMap: Map<string, number>,
  totalUsdc: number
): { holdings: PortfolioHolding[]; dustHiddenCount: number } {
  const targetMap = new Map(targets.map((t) => [t.asset, t.weightPct]));
  const byAsset = new Map<string, PortfolioHolding>();
  let dustHiddenCount = 0;

  for (const a of assets) {
    if (a.valueUsdc <= 0 && a.qty <= 0) continue;
    const targetWeightPct = targetMap.get(a.asset) ?? 0;
    const draft: PortfolioHolding = {
      asset: a.asset,
      qty: a.qty,
      price: a.price,
      valueUsdc: a.valueUsdc,
      currentWeightPct: 0,
      targetWeightPct,
      driftPct: 0,
      inTradingQty: 0,
      investableQty: 0,
      isStable: STABLES.has(a.asset),
    };
    if (targetWeightPct <= 0 && isPortfolioDust(draft)) {
      dustHiddenCount++;
      continue;
    }
    const inTradingQty = Math.min(a.qty, tradingMap.get(a.asset) || 0);
    const investableQty = Math.max(0, a.qty - inTradingQty);
    byAsset.set(a.asset, {
      ...draft,
      currentWeightPct: totalUsdc > 0 ? (a.valueUsdc / totalUsdc) * 100 : 0,
      inTradingQty,
      investableQty,
    });
  }

  for (const t of targets) {
    if (!byAsset.has(t.asset)) {
      byAsset.set(t.asset, {
        asset: t.asset,
        qty: 0,
        price: 0,
        valueUsdc: 0,
        currentWeightPct: 0,
        targetWeightPct: t.weightPct,
        driftPct: -t.weightPct,
        inTradingQty: 0,
        investableQty: 0,
        isStable: STABLES.has(t.asset),
      });
    }
  }

  const holdings = [...byAsset.values()]
    .map((h) => ({
      ...h,
      driftPct: +(h.currentWeightPct - h.targetWeightPct).toFixed(2),
    }))
    .sort((a, b) => b.valueUsdc - a.valueUsdc);

  return { holdings, dustHiddenCount };
}

export function computeRebalancePlan(
  holdings: PortfolioHolding[],
  totalUsdc: number,
  thresholdPct: number
): RebalanceAction[] {
  if (totalUsdc <= 0) return [];

  const actions: RebalanceAction[] = [];
  for (const h of holdings) {
    if (h.targetWeightPct <= 0) continue;
    const drift = h.driftPct;
    if (Math.abs(drift) < thresholdPct) continue;

    const targetValue = (h.targetWeightPct / 100) * totalUsdc;
    const delta = targetValue - h.valueUsdc;
    if (Math.abs(delta) < 5) continue;

    actions.push({
      asset: h.asset,
      action: delta > 0 ? "BUY" : "SELL",
      suggestedUsdc: +Math.abs(delta).toFixed(2),
      driftPct: drift,
      currentWeightPct: h.currentWeightPct,
      targetWeightPct: h.targetWeightPct,
      reason:
        drift > 0
          ? `Sub-alocat cu ${Math.abs(drift).toFixed(1)}% față de țintă`
          : `Supra-alocat cu ${Math.abs(drift).toFixed(1)}% față de țintă`,
    });
  }

  return actions.sort((a, b) => b.suggestedUsdc - a.suggestedUsdc);
}

export async function buildPortfolioSnapshot(
  userId: string,
  settings: RuntimeSettings
): Promise<PortfolioSnapshot> {
  await connectDB();
  const doc = await getOrCreateInvestPortfolio(userId);
  const targets = normalizeTargets((doc.targets as InvestTarget[]) || DEFAULT_TARGETS);
  const tradingMap = await tradingQtyByAsset(userId);

  let totalUsdc = 0;
  let tickerOk = false;
  let portfolioError: string | null = null;
  let assets: { asset: string; qty: number; price: number; valueUsdc: number }[] = [];

  try {
    syncToEnv(settings);
    const pv = await fetchPortfolioValueUsdc(settings.binanceTestnet);
    totalUsdc = pv.total;
    tickerOk = pv.tickerOk;
    assets = pv.assets;
  } catch (e) {
    portfolioError = e instanceof Error ? e.message.slice(0, 300) : "Eroare Binance";
    totalUsdc = settings.cashBalanceUsdc || 0;
  }

  let tradingLockedUsdc = 0;
  for (const h of assets) {
    const lockedQty = Math.min(h.qty, tradingMap.get(h.asset) || 0);
    if (h.qty > 0) tradingLockedUsdc += (lockedQty / h.qty) * h.valueUsdc;
  }

  const { holdings, dustHiddenCount } = mergeHoldings(assets, targets, tradingMap, totalUsdc);
  const maxDriftPct = holdings.reduce((m, h) => Math.max(m, Math.abs(h.driftPct)), 0);
  const threshold = doc.rebalanceThresholdPct ?? 5;
  const rebalancePlan = computeRebalancePlan(holdings, totalUsdc, threshold);

  return {
    totalUsdc: +totalUsdc.toFixed(4),
    investableUsdc: +(totalUsdc - tradingLockedUsdc).toFixed(4),
    tradingLockedUsdc: +tradingLockedUsdc.toFixed(4),
    updatedAt: new Date().toISOString(),
    tickerOk,
    portfolioError,
    maxDriftPct: +maxDriftPct.toFixed(2),
    needsRebalance: rebalancePlan.length > 0,
    holdings,
    rebalancePlan,
    dustHiddenCount,
  };
}

export async function getInvestPortfolioView(userId: string): Promise<InvestPortfolioView> {
  const settings = await getSettings(userId);
  const doc = await getOrCreateInvestPortfolio(userId);
  const snapshot = await buildPortfolioSnapshot(userId, settings);
  return {
    name: doc.name || "Portofoliu long-term",
    rebalanceThresholdPct: doc.rebalanceThresholdPct ?? 5,
    targets: normalizeTargets((doc.targets as InvestTarget[]) || DEFAULT_TARGETS),
    snapshot,
    lastAiAdvice: (doc.lastAiAdvice as PortfolioAiAdvice | null) ?? null,
    lastAiAdviceAt: doc.lastAiAdviceAt ? doc.lastAiAdviceAt.toISOString() : null,
  };
}

function buildPortfolioAiPrompt(view: InvestPortfolioView): string {
  const { snapshot, targets, rebalanceThresholdPct } = view;
  const holdingsLines = filterPortfolioHoldings(snapshot.holdings)
    .filter((h) => h.valueUsdc > 0 || h.targetWeightPct > 0)
    .map(
      (h) =>
        `- ${h.asset}: $${h.valueUsdc.toFixed(2)} (${h.currentWeightPct.toFixed(1)}% vs țintă ${h.targetWeightPct.toFixed(1)}%, drift ${h.driftPct >= 0 ? "+" : ""}${h.driftPct.toFixed(1)}%)`
    )
    .join("\n");

  const planLines =
    snapshot.rebalancePlan.length > 0
      ? snapshot.rebalancePlan
          .map((a) => `- ${a.action} ${a.asset}: ~$${a.suggestedUsdc} (${a.reason})`)
          .join("\n")
      : "- Niciuna sub pragul local";

  return `Ești consultant crypto pentru portofolii long-term (6–36 luni), diversificare și rebalansare.

Total: $${snapshot.totalUsdc.toFixed(2)} | Investabil: $${snapshot.investableUsdc.toFixed(2)} | Trading blocat: $${snapshot.tradingLockedUsdc.toFixed(2)}
Prag rebalansare: ${rebalanceThresholdPct}% | Drift max: ${snapshot.maxDriftPct.toFixed(1)}%

ȚINTE:
${targets.map((t) => `- ${t.asset}: ${t.weightPct}%`).join("\n")}

DEȚINERI:
${holdingsLines || "- gol"}

REBALANSARE LOCALĂ:
${planLines}

Răspunde DOAR JSON valid. Texte în română. Evită day-trading agresiv.

{
  "summary": "max 200 caractere",
  "rebalanceUrgency": "LOW|MEDIUM|HIGH",
  "recommendations": [{ "asset": "BTC", "action": "BUY|SELL|HOLD", "suggestedUsdc": 0, "reason": "..." }],
  "investmentIdeas": [{ "asset": "ETH", "action": "CONSIDER_BUY|CONSIDER_SELL|WATCH", "suggestedAllocationPct": 5, "horizon": "12 luni", "reason": "..." }],
  "riskNotes": ["..."]
}`;
}

export async function generatePortfolioAiAdvice(userId: string): Promise<PortfolioAiAdvice> {
  const settings = await getSettings(userId);
  assertAiReady(settings, "default");

  const view = await getInvestPortfolioView(userId);
  const ai = await callAI(buildPortfolioAiPrompt(view), settings, { role: "default", maxTokens: 2048 });

  const parsed = safeParseJson<Omit<PortfolioAiAdvice, "provider" | "model" | "generatedAt">>(ai.text);
  if (!parsed?.summary) throw new Error("AI nu a returnat JSON valid — încearcă din nou");

  const advice: PortfolioAiAdvice = {
    summary: String(parsed.summary),
    rebalanceUrgency:
      parsed.rebalanceUrgency === "HIGH" || parsed.rebalanceUrgency === "MEDIUM"
        ? parsed.rebalanceUrgency
        : "LOW",
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 8).map((r: any) => ({
          asset: String(r.asset || "").toUpperCase(),
          action: r.action === "BUY" || r.action === "SELL" ? r.action : "HOLD",
          suggestedUsdc: typeof r.suggestedUsdc === "number" ? r.suggestedUsdc : undefined,
          reason: String(r.reason || ""),
        }))
      : [],
    investmentIdeas: Array.isArray(parsed.investmentIdeas)
      ? parsed.investmentIdeas.slice(0, 6).map((r: any) => ({
          asset: String(r.asset || "").toUpperCase(),
          action:
            r.action === "CONSIDER_BUY" || r.action === "CONSIDER_SELL" ? r.action : "WATCH",
          suggestedAllocationPct:
            typeof r.suggestedAllocationPct === "number" ? r.suggestedAllocationPct : undefined,
          horizon: r.horizon ? String(r.horizon) : undefined,
          reason: String(r.reason || ""),
        }))
      : [],
    riskNotes: Array.isArray(parsed.riskNotes) ? parsed.riskNotes.map(String).slice(0, 5) : [],
    provider: ai.provider,
    model: ai.model,
    generatedAt: new Date().toISOString(),
  };

  await connectDB();
  await InvestPortfolio.findOneAndUpdate(
    { userId: toObjectId(userId) },
    { $set: { lastAiAdvice: advice, lastAiAdviceAt: new Date() } }
  );

  return advice;
}
