import { connectDB } from "./db";
import { Settings } from "@/models/Settings";
import { decrypt, encrypt } from "./crypto";
import { fetchPortfolioValueUsdc } from "./binance";
import { normalizePairBlacklistEntries } from "./pairBlacklistCore";

export type RuntimeSettings = {
  aiProvider: "claude" | "gemini" | "ollama";
  aiModel: string;
  /** When set, analysis cron uses this model; position check keeps aiModel. */
  analysisAiModel: string;
  aiApiKey: string;
  ollamaUrl: string;
  binanceApiKey: string;
  binanceApiSecret: string;
  binanceTestnet: boolean;
  pilotActive: boolean;
  positionCheckCronActive: boolean;
  analysisCronActive: boolean;
  dryRun: boolean;
  maxOpenPairs: number;
  maxUsdcPerOrder: number;
  minConfidence: number;
  entryGateEnabled: boolean;
  minTechnicalScore: number;
  requireStrongBuyOnly: boolean;
  maxPump24hPct: number;
  slCooldownMinutes: number;
  tpReopenCooldownMinutes: number;
  defaultReopenCooldownMinutes: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  riskRewardRatio: number;
  telegramBotToken: string;
  telegramChatId: string;
  displayTimezone: string;
  cashBalanceUsdc: number;
  cashBalanceUpdatedAt: Date | null;
  /** Uppercase symbols or base assets excluded from automated opens (see Settings UI). */
  pairBlacklist: string[];
  updatedAt?: Date;
};

const SECRET_FIELDS = ["aiApiKey", "binanceApiKey", "binanceApiSecret", "telegramBotToken"] as const;

export async function getSettings(): Promise<RuntimeSettings> {
  await connectDB();
  let doc = await Settings.findOne().lean();
  if (!doc) {
    const created = await Settings.create({
      aiProvider: (process.env.AI_PROVIDER as any) || "claude",
      aiModel: process.env.ANTHROPIC_MODEL || process.env.GOOGLE_MODEL || process.env.OLLAMA_MODEL || "claude-sonnet-4-5",
      aiApiKey: encrypt(process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY || ""),
      ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
      binanceApiKey: encrypt(process.env.BINANCE_API_KEY || ""),
      binanceApiSecret: encrypt(process.env.BINANCE_API_SECRET || ""),
      binanceTestnet: (process.env.BINANCE_TESTNET || "true") === "true",
      pairBlacklist: [],
    });
    doc = created.toObject();
  }

  const out: any = { ...doc };
  for (const f of SECRET_FIELDS) out[f] = decrypt(out[f] || "");
  out.pairBlacklist = normalizePairBlacklistEntries(out.pairBlacklist);
  syncToEnv(out);
  return out as RuntimeSettings;
}

export async function updateSettings(patch: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  await connectDB();
  const update: any = { ...patch };
  if ("pairBlacklist" in update && Array.isArray(update.pairBlacklist)) {
    update.pairBlacklist = normalizePairBlacklistEntries(update.pairBlacklist);
  }
  for (const f of SECRET_FIELDS) {
    if (f in update && typeof update[f] === "string") {
      update[f] = update[f] ? encrypt(update[f]) : "";
    }
  }
  const doc = await Settings.findOneAndUpdate({}, { $set: update }, { new: true, upsert: true }).lean();
  const out: any = { ...doc };
  for (const f of SECRET_FIELDS) out[f] = decrypt(out[f] || "");
  out.pairBlacklist = normalizePairBlacklistEntries(out.pairBlacklist);
  syncToEnv(out);
  return out as RuntimeSettings;
}

/** Reflect current settings into process.env so libs reading env see the right values. */
export function syncToEnv(s: RuntimeSettings) {
  process.env.AI_PROVIDER = s.aiProvider;
  if (s.aiProvider === "claude") {
    process.env.ANTHROPIC_API_KEY = s.aiApiKey || "";
    process.env.ANTHROPIC_MODEL = s.aiModel || "claude-sonnet-4-5";
  } else if (s.aiProvider === "gemini") {
    process.env.GOOGLE_API_KEY = s.aiApiKey || "";
    process.env.GOOGLE_MODEL = s.aiModel || "gemini-2.0-flash";
  } else if (s.aiProvider === "ollama") {
    process.env.OLLAMA_URL = s.ollamaUrl || "http://localhost:11434";
    process.env.OLLAMA_MODEL = s.aiModel || "llama3.2";
  }
  process.env.BINANCE_API_KEY = s.binanceApiKey || "";
  process.env.BINANCE_API_SECRET = s.binanceApiSecret || "";
  process.env.BINANCE_TESTNET = String(s.binanceTestnet);
  if (s.telegramBotToken) process.env.TELEGRAM_BOT_TOKEN = s.telegramBotToken;
  if (s.telegramChatId) process.env.TELEGRAM_CHAT_ID = s.telegramChatId;
}

/**
 * Pulls the full Binance portfolio value (USDC cash + all other assets priced
 * in USDC) and persists it into Settings so the dashboard has a reliable
 * snapshot to fall back on when a live call hiccups.
 *
 * Best-effort: swallows Binance errors and returns the existing snapshot so
 * the caller's main flow (open/close position) doesn't fail over this.
 */
export async function syncCashBalanceFromBinance(testnet?: boolean): Promise<{
  total: number;
  updatedAt: Date | null;
  error: string | null;
  breakdown?: { asset: string; qty: number; price: number; valueUsdc: number }[];
  unpriced?: { asset: string; qty: number }[];
  tickerOk?: boolean;
}> {
  await connectDB();
  try {
    const current = await Settings.findOne().lean();
    const net = typeof testnet === "boolean" ? testnet : (current as any)?.binanceTestnet ?? true;
    const pv = await fetchPortfolioValueUsdc(net);
    const now = new Date();
    await Settings.findOneAndUpdate(
      {},
      { $set: { cashBalanceUsdc: pv.total, cashBalanceUpdatedAt: now } },
      { upsert: true }
    );
    const unpriced = pv.assets.filter((a) => a.price === 0).map((a) => ({ asset: a.asset, qty: a.qty }));
    return {
      total: pv.total,
      updatedAt: now,
      error: null,
      breakdown: pv.assets,
      unpriced,
      tickerOk: pv.tickerOk,
    };
  } catch (err: any) {
    const msg = err?.message?.slice(0, 300) || "sync failed";
    console.warn("[syncCashBalance] failed:", msg);
    const doc = await Settings.findOne().lean();
    return {
      total: (doc as any)?.cashBalanceUsdc || 0,
      updatedAt: (doc as any)?.cashBalanceUpdatedAt || null,
      error: msg,
    };
  }
}

export function redact(s: RuntimeSettings) {
  const m = (v?: string) => (v ? `${v.slice(0, 3)}••••${v.slice(-3)}` : "");
  return {
    ...s,
    aiApiKey: m(s.aiApiKey),
    binanceApiKey: m(s.binanceApiKey),
    binanceApiSecret: m(s.binanceApiSecret),
    telegramBotToken: m(s.telegramBotToken),
  };
}
