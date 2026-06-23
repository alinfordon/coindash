import { connectDB } from "./db";
import { Settings } from "@/models/Settings";
import { decrypt, encrypt } from "./crypto";
import { fetchPortfolioValueUsdc } from "./binance";
import { normalizePairBlacklistEntries } from "./pairBlacklistCore";
import { normalizeAnalysisIndicators, type AnalysisIndicatorsConfig } from "./analysisIndicators";
import { geminiModelMigrationPatch, providerModelMigrationPatch } from "./aiModels";
import {
  type AiApiKeys,
  type CloudAiProvider,
  CLOUD_AI_PROVIDERS,
  activeCloudProvider,
  isRedactedSecret,
  resolveAiApiKeyForProvider,
  stripRedactedAiApiKeys,
} from "./aiApiKeys";
import { dedupeSettingsPerUser, migrateLegacyTenantData, toObjectId } from "./tenant";
import { User } from "@/models/User";

export type RuntimeSettings = {
  aiProvider: "claude" | "gemini" | "deepseek" | "ollama";
  aiModel: string;
  analysisAiModel: string;
  /** Key for the active cloud provider (derived). */
  aiApiKey: string;
  /** Saved keys per cloud provider — persist when switching models/providers. */
  aiApiKeys: AiApiKeys;
  ollamaUrl: string;
  deepseekBaseUrl: string;
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
  analysisIndicators: AnalysisIndicatorsConfig;
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
  "deepseekBaseUrl",
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
  "analysisIndicators",
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
    } else if (key === "analysisIndicators" && v && typeof v === "object") {
      v = normalizeAnalysisIndicators(v);
    } else if (typeof v === "string") {
      v = v.trim();
    }
    out[key] = v;
  }
  if (patch.aiApiKeys && typeof patch.aiApiKeys === "object") {
    out.aiApiKeys = patch.aiApiKeys;
  }
  return out as Partial<RuntimeSettings>;
}

function readEncryptedAiApiKeys(doc: Record<string, unknown>): Record<CloudAiProvider, string> {
  const raw = (doc.aiApiKeys || {}) as Record<string, string>;
  return {
    claude: raw.claude || "",
    gemini: raw.gemini || "",
    deepseek: raw.deepseek || "",
  };
}

function decryptAiApiKeys(encrypted: Record<CloudAiProvider, string>): AiApiKeys {
  return {
    claude: decrypt(encrypted.claude || ""),
    gemini: decrypt(encrypted.gemini || ""),
    deepseek: decrypt(encrypted.deepseek || ""),
  };
}

function migrateLegacyAiApiKeysPatch(
  doc: Record<string, unknown>,
  provider: string
): { aiApiKeys: Record<CloudAiProvider, string> } | null {
  const encrypted = readEncryptedAiApiKeys(doc);
  const hasAny = CLOUD_AI_PROVIDERS.some((p) => encrypted[p]);
  if (hasAny) return null;
  const legacy = doc.aiApiKey as string | undefined;
  if (!legacy) return null;
  const cloud = activeCloudProvider(provider === "zai" ? "deepseek" : provider);
  if (!cloud) return null;
  return { aiApiKeys: { ...encrypted, [cloud]: legacy } };
}


function deepseekProviderMigrationPatch(doc: Record<string, unknown>): Partial<RuntimeSettings> | null {
  const provider = doc.aiProvider as string | undefined;
  if (provider !== "zai" && provider !== "deepseek") return null;
  const patch: Partial<RuntimeSettings> = {};
  if (provider === "zai") patch.aiProvider = "deepseek";
  const base = doc.deepseekBaseUrl || doc.zaiBaseUrl;
  if (!base || String(base).includes("z.ai")) {
    patch.deepseekBaseUrl = "https://api.deepseek.com";
  } else if (!doc.deepseekBaseUrl && doc.zaiBaseUrl) {
    patch.deepseekBaseUrl = String(doc.zaiBaseUrl);
  }
  const mapModel = (m: unknown) => {
    const s = String(m || "");
    if (!s || s.startsWith("glm")) return "deepseek-chat";
    return s;
  };
  if (typeof doc.aiModel === "string" && doc.aiModel.startsWith("glm")) patch.aiModel = mapModel(doc.aiModel);
  if (typeof doc.analysisAiModel === "string" && doc.analysisAiModel.startsWith("glm")) {
    patch.analysisAiModel = mapModel(doc.analysisAiModel);
  }
  return Object.keys(patch).length ? patch : provider === "zai" ? { aiProvider: "deepseek" } : null;
}

function defaultSettingsPayload(fromEnv: boolean) {
  const envProvider = process.env.AI_PROVIDER as RuntimeSettings["aiProvider"] | undefined;
  const aiProvider =
    envProvider === "zai" ? "deepseek" : envProvider && ["claude", "gemini", "deepseek", "ollama"].includes(envProvider) ? envProvider : "claude";

  const plainKey = fromEnv
    ? process.env.ANTHROPIC_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.DEEPSEEK_API_KEY ||
      process.env.ZAI_API_KEY ||
      ""
    : "";
  const encryptedKey = plainKey ? encrypt(plainKey) : "";
  const cloud = activeCloudProvider(aiProvider);

  return {
    aiProvider,
    aiModel:
      process.env.ANTHROPIC_MODEL ||
      process.env.GOOGLE_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      (process.env.ZAI_MODEL?.startsWith("glm") ? "deepseek-chat" : process.env.ZAI_MODEL) ||
      process.env.OLLAMA_MODEL ||
      "claude-sonnet-4-5",
    aiApiKey: encryptedKey,
    aiApiKeys: {
      claude: cloud === "claude" ? encryptedKey : "",
      gemini: cloud === "gemini" ? encryptedKey : "",
      deepseek: cloud === "deepseek" ? encryptedKey : "",
    },
    ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
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
  out.deepseekBaseUrl = String(
    doc.deepseekBaseUrl ?? doc.zaiBaseUrl ?? "https://api.deepseek.com"
  ).replace(/\/$/, "");
  if (out.aiProvider === "zai") out.aiProvider = "deepseek";
  if (typeof out.aiModel === "string" && out.aiModel.startsWith("glm")) out.aiModel = "deepseek-chat";
  if (typeof out.analysisAiModel === "string" && out.analysisAiModel.startsWith("glm")) {
    out.analysisAiModel = "deepseek-chat";
  }
  if (doc.cashBalanceUsdc != null) out.cashBalanceUsdc = Number(doc.cashBalanceUsdc) || 0;
  if (doc.cashBalanceUpdatedAt != null) out.cashBalanceUpdatedAt = doc.cashBalanceUpdatedAt as Date;
  if (doc.updatedAt != null) out.updatedAt = doc.updatedAt as Date;
  out.dryRun = doc.dryRun === true;
  out.binanceTestnet = doc.binanceTestnet !== false;

  for (const f of SECRET_FIELDS) {
    if (f === "aiApiKey") continue;
    out[f] = decrypt((doc[f] as string) || "");
  }

  const aiApiKeys = decryptAiApiKeys(readEncryptedAiApiKeys(doc));
  const legacyKey = decrypt((doc.aiApiKey as string) || "");
  const cloud = activeCloudProvider(out.aiProvider);
  if (legacyKey && cloud && !aiApiKeys[cloud]) aiApiKeys[cloud] = legacyKey;

  out.aiApiKeys = aiApiKeys;
  out.aiApiKey = resolveAiApiKeyForProvider({
    aiProvider: out.aiProvider,
    aiApiKeys,
    aiApiKey: "",
  });
  out.pairBlacklist = normalizePairBlacklistEntries(out.pairBlacklist);
  out.analysisIndicators = normalizeAnalysisIndicators(doc.analysisIndicators);
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

  const modelPatch = providerModelMigrationPatch(out.aiProvider, out.aiModel, out.analysisAiModel);
  if (modelPatch) {
    Object.assign(out, modelPatch);
    Settings.findOneAndUpdate({ userId: uid }, { $set: modelPatch }).catch((e) =>
      console.warn("[settings] provider model migration failed:", e?.message)
    );
  }

  const deepseekPatch = deepseekProviderMigrationPatch(doc);
  if (deepseekPatch) {
    Object.assign(out, deepseekPatch);
    Settings.findOneAndUpdate({ userId: uid }, { $set: deepseekPatch, $unset: { zaiBaseUrl: "" } }).catch((e) =>
      console.warn("[settings] deepseek migration failed:", e?.message)
    );
  }

  const keysPatch = migrateLegacyAiApiKeysPatch(doc, String(out.aiProvider));
  if (keysPatch) {
    Settings.findOneAndUpdate({ userId: uid }, { $set: keysPatch }).catch((e) =>
      console.warn("[settings] aiApiKeys migration failed:", e?.message)
    );
    out.aiApiKeys = decryptAiApiKeys(keysPatch.aiApiKeys);
    out.aiApiKey = resolveAiApiKeyForProvider(out);
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
  const provider = update.aiProvider ?? (current as any)?.aiProvider ?? "claude";
  const aiModel = update.aiModel ?? (current as any)?.aiModel ?? "";
  const analysisAiModel = update.analysisAiModel ?? (current as any)?.analysisAiModel ?? "";
  const geminiPatch = geminiModelMigrationPatch(provider, aiModel, analysisAiModel);
  if (geminiPatch) Object.assign(update, geminiPatch);
  const modelPatch = providerModelMigrationPatch(provider, update.aiModel ?? aiModel, update.analysisAiModel ?? analysisAiModel);
  if (modelPatch) Object.assign(update, modelPatch);

  const incomingKeys = stripRedactedAiApiKeys(update.aiApiKeys);
  const legacyIncoming =
    typeof update.aiApiKey === "string" && update.aiApiKey && !isRedactedSecret(update.aiApiKey)
      ? update.aiApiKey.trim()
      : null;
  delete update.aiApiKey;
  delete update.aiApiKeys;

  if (incomingKeys || legacyIncoming) {
    const mergedEncrypted = readEncryptedAiApiKeys((current || {}) as Record<string, unknown>);
    if (incomingKeys) {
      for (const p of CLOUD_AI_PROVIDERS) {
        const plain = incomingKeys[p];
        if (plain) mergedEncrypted[p] = encrypt(plain);
      }
    }
    if (legacyIncoming) {
      const cloud = activeCloudProvider(provider === "zai" ? "deepseek" : provider);
      if (cloud) mergedEncrypted[cloud] = encrypt(legacyIncoming);
    }
    update.aiApiKeys = mergedEncrypted;
    const activeCloud = activeCloudProvider(provider === "zai" ? "deepseek" : provider);
    if (activeCloud) update.aiApiKey = mergedEncrypted[activeCloud] || "";
  }

  for (const f of SECRET_FIELDS) {
    if (f === "aiApiKey") continue;
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
  } else if (s.aiProvider === "deepseek") {
    process.env.DEEPSEEK_API_KEY = s.aiApiKey || "";
    process.env.DEEPSEEK_MODEL = s.aiModel || "deepseek-chat";
    process.env.DEEPSEEK_BASE_URL = s.deepseekBaseUrl || "https://api.deepseek.com";
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
  const aiApiKeys = {
    claude: m(s.aiApiKeys?.claude),
    gemini: m(s.aiApiKeys?.gemini),
    deepseek: m(s.aiApiKeys?.deepseek),
  };
  const cloud = activeCloudProvider(s.aiProvider);
  return {
    ...s,
    aiApiKeys,
    aiApiKey: cloud ? aiApiKeys[cloud] : "",
    binanceApiKey: m(s.binanceApiKey),
    binanceApiSecret: m(s.binanceApiSecret),
    telegramBotToken: m(s.telegramBotToken),
  };
}
