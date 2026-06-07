import { connectDB } from "./db";
import { Settings } from "@/models/Settings";
import { decrypt, encrypt } from "./crypto";
import { fetchPortfolioValueUsdc } from "./binance";
import { normalizePairBlacklistEntries } from "./pairBlacklistCore";
import { geminiModelMigrationPatch } from "./aiModels";
import { dedupeSettingsPerUser, migrateLegacyTenantData, toObjectId } from "./tenant";
import { User } from "@/models/User";

export type RuntimeSettings = {
  aiProvider: "claude" | "gemini" | "zai" | "ollama";
  aiModel: string;
  analysisAiModel: string;
  aiApiKey: string;
  ollamaUrl: string;
  zaiBaseUrl: string;
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
  analysisTrendInterval: string;
  analysisEntryInterval: string;
  stopLossPercent: number;
  takeProfitPercent: number;
  riskRewardRatio: number;
  telegramBotToken: string;
  telegramChatId: string;
  displayTimezone: string;
  cashBalanceUsdc: number;
  cashBalanceUpdatedAt: Date | null;
  pairBlacklist: string[];
  updatedAt?: Date;
};

const SECRET_FIELDS = ["aiApiKey", "binanceApiKey", "binanceApiSecret", "telegramBotToken"] as const;

const PATCH_KEYS = [
  "aiProvider",
  "aiModel",
  "analysisAiModel",
  "aiApiKey",
  "ollamaUrl",
  "zaiBaseUrl",
  "binanceApiKey",
  "binanceApiSecret",
  "binanceTestnet",
  "pilotActive",
  "positionCheckCronActive",
  "analysisCronActive",
  "dryRun",
  "maxOpenPairs",
  "maxUsdcPerOrder",
  "minConfidence",
  "entryGateEnabled",
  "minTechnicalScore",
  "requireStrongBuyOnly",
  "maxPump24hPct",
  "slCooldownMinutes",
  "tpReopenCooldownMinutes",
  "defaultReopenCooldownMinutes",
  "analysisTrendInterval",
  "analysisEntryInterval",
  "stopLossPercent",
  "takeProfitPercent",
  "riskRewardRatio",
  "telegramBotToken",
  "telegramChatId",
  "displayTimezone",
  "pairBlacklist",
] as const;

const NUMERIC_PATCH_KEYS = new Set([
  "maxOpenPairs",
  "maxUsdcPerOrder",
  "minConfidence",
  "minTechnicalScore",
  "maxPump24hPct",
  "slCooldownMinutes",
  "tpReopenCooldownMinutes",
  "defaultReopenCooldownMinutes",
  "stopLossPercent",
  "takeProfitPercent",
  "riskRewardRatio",
]);

const BOOL_PATCH_KEYS = new Set([
  "binanceTestnet",
  "pilotActive",
  "positionCheckCronActive",
  "analysisCronActive",
  "dryRun",
  "entryGateEnabled",
  "requireStrongBuyOnly",
]);

/** Strip Mongo metadata and read-only fields sent back from the Settings UI. */
export function sanitizeSettingsPatch(patch: Record<string, unknown>): Partial<RuntimeSettings> {
  const out: Record<string, unknown> = {};
  for (const key of PATCH_KEYS) {
    if (!(key in patch)) continue;
    let v = patch[key];
    if (NUMERIC_PATCH_KEYS.has(key)) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      v = n;
    } else if (BOOL_PATCH_KEYS.has(key)) {
      v = v === true || v === "true";
    } else if (key === "pairBlacklist" && Array.isArray(v)) {
      v = normalizePairBlacklistEntries(v);
    } else if (typeof v === "string") {
      v = v.trim();
    }
    out[key] = v;
  }
  return out as Partial<RuntimeSettings>;
}

function defaultSettingsPayload(fromEnv: boolean) {
  return {
    aiProvider: (process.env.AI_PROVIDER as RuntimeSettings["aiProvider"]) || "claude",
    aiModel:
      process.env.ANTHROPIC_MODEL ||
      process.env.GOOGLE_MODEL ||
      process.env.ZAI_MODEL ||
      process.env.OLLAMA_MODEL ||
      "claude-sonnet-4-5",
    aiApiKey: fromEnv
      ? encrypt(
          process.env.ANTHROPIC_API_KEY ||
            process.env.GOOGLE_API_KEY ||
            process.env.ZAI_API_KEY ||
            ""
        )
      : "",
    ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    zaiBaseUrl: process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4",
    binanceApiKey: fromEnv ? encrypt(process.env.BINANCE_API_KEY || "") : "",
    binanceApiSecret: fromEnv ? encrypt(process.env.BINANCE_API_SECRET || "") : "",
    binanceTestnet: fromEnv ? (process.env.BINANCE_TESTNET || "true") === "true" : true,
    dryRun: true,
    pilotActive: false,
    pairBlacklist: [] as string[],
  };
}

function docToRuntime(doc: Record<string, unknown>): RuntimeSettings {
  const out: any = {};
  for (const key of PATCH_KEYS) {
    if (key in doc) out[key] = doc[key];
  }
  if (doc.cashBalanceUsdc != null) out.cashBalanceUsdc = Number(doc.cashBalanceUsdc) || 0;
  if (doc.cashBalanceUpdatedAt != null) out.cashBalanceUpdatedAt = doc.cashBalanceUpdatedAt as Date;
  if (doc.updatedAt != null) out.updatedAt = doc.updatedAt as Date;
  for (const f of SECRET_FIELDS) out[f] = decrypt((out[f] as string) || "");
  out.pairBlacklist = normalizePairBlacklistEntries(out.pairBlacklist);
  return out as RuntimeSettings;
}

export async function getSettings(userId: string): Promise<RuntimeSettings> {
  await connectDB();
  await migrateLegacyTenantData();
  await dedupeSettingsPerUser();

  const uid = toObjectId(userId);
  let doc: Record<string, unknown> | null = (await Settings.findOne({ userId: uid })
    .sort({ updatedAt: -1 })
    .lean()) as Record<string, unknown> | null;

  if (!doc) {
    const userCount = await User.countDocuments();
    const fromEnv = userCount <= 1;
    doc = (await Settings.findOneAndUpdate(
      { userId: uid },
      { $setOnInsert: { userId: uid, ...defaultSettingsPayload(fromEnv) } },
      { upsert: true, new: true }
    ).lean()) as Record<string, unknown>;
  }

  const out = docToRuntime(doc);

  const geminiPatch = geminiModelMigrationPatch(out.aiProvider, out.aiModel, out.analysisAiModel);
  if (geminiPatch) {
    Object.assign(out, geminiPatch);
    Settings.findOneAndUpdate({ userId: uid }, { $set: geminiPatch }).catch((e) =>
      console.warn("[settings] gemini model migration failed:", e?.message)
    );
  }

  syncToEnv(out);
  return out;
}

export async function updateSettings(
  userId: string,
  patch: Partial<RuntimeSettings> | Record<string, unknown>
): Promise<RuntimeSettings> {
  await connectDB();
  await dedupeSettingsPerUser();
  const uid = toObjectId(userId);
  const update: any = sanitizeSettingsPatch(patch as Record<string, unknown>);
  if ("pairBlacklist" in update && Array.isArray(update.pairBlacklist)) {
    update.pairBlacklist = normalizePairBlacklistEntries(update.pairBlacklist);
  }
  const current = await Settings.findOne({ userId: uid }).lean();
  const provider = update.aiProvider ?? (current as any)?.aiProvider;
  const aiModel = update.aiModel ?? (current as any)?.aiModel ?? "";
  const analysisAiModel = update.analysisAiModel ?? (current as any)?.analysisAiModel ?? "";
  const geminiPatch = geminiModelMigrationPatch(provider, aiModel, analysisAiModel);
  if (geminiPatch) Object.assign(update, geminiPatch);
  for (const f of SECRET_FIELDS) {
    if (f in update && typeof update[f] === "string") {
      update[f] = update[f] ? encrypt(update[f]) : "";
    }
  }
  if (!Object.keys(update).length) {
    const existing = await Settings.findOne({ userId: uid }).lean();
    if (!existing) throw new Error("Nothing to save");
    const out = docToRuntime(existing as Record<string, unknown>);
    syncToEnv(out);
    return out;
  }

  const setOnInsert: Record<string, unknown> = { userId: uid, ...defaultSettingsPayload(false) };
  for (const key of Object.keys(update)) delete setOnInsert[key];

  const doc = await Settings.findOneAndUpdate(
    { userId: uid },
    { $set: update, $setOnInsert: setOnInsert },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  if (!doc) throw new Error("Settings save failed");
  const out = docToRuntime(doc as Record<string, unknown>);
  syncToEnv(out);
  return out;
}

export function syncToEnv(s: RuntimeSettings) {
  process.env.AI_PROVIDER = s.aiProvider;
  if (s.aiProvider === "claude") {
    process.env.ANTHROPIC_API_KEY = s.aiApiKey || "";
    process.env.ANTHROPIC_MODEL = s.aiModel || "claude-sonnet-4-5";
  } else if (s.aiProvider === "gemini") {
    process.env.GOOGLE_API_KEY = s.aiApiKey || "";
    process.env.GOOGLE_MODEL = s.aiModel || "gemini-2.5-flash-lite";
  } else if (s.aiProvider === "zai") {
    process.env.ZAI_API_KEY = s.aiApiKey || "";
    process.env.ZAI_MODEL = s.aiModel || "glm-4.5-air";
    process.env.ZAI_BASE_URL = s.zaiBaseUrl || "https://api.z.ai/api/paas/v4";
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

export async function syncCashBalanceFromBinance(
  userId: string,
  testnet?: boolean
): Promise<{
  total: number;
  updatedAt: Date | null;
  error: string | null;
  breakdown?: { asset: string; qty: number; price: number; valueUsdc: number }[];
  unpriced?: { asset: string; qty: number }[];
  tickerOk?: boolean;
}> {
  await connectDB();
  const uid = toObjectId(userId);
  try {
    const current = await Settings.findOne({ userId: uid }).lean();
    const net = typeof testnet === "boolean" ? testnet : (current as any)?.binanceTestnet ?? true;
    const s = docToRuntime((current || {}) as Record<string, unknown>);
    syncToEnv(s);
    const pv = await fetchPortfolioValueUsdc(net);
    const now = new Date();
    await Settings.findOneAndUpdate(
      { userId: uid },
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
    const doc = await Settings.findOne({ userId: uid }).lean();
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
