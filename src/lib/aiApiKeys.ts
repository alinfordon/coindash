import type { RuntimeSettings } from "./settings";

export type CloudAiProvider = "claude" | "gemini" | "deepseek";

export type AiApiKeys = Record<CloudAiProvider, string>;

export const CLOUD_AI_PROVIDERS: CloudAiProvider[] = ["claude", "gemini", "deepseek"];

export const EMPTY_AI_API_KEYS: AiApiKeys = {
  claude: "",
  gemini: "",
  deepseek: "",
};

export function isRedactedSecret(v: unknown): boolean {
  return typeof v === "string" && v.includes("•");
}

/** Remove masked placeholders; keep only newly typed secrets from the UI. */
export function stripRedactedAiApiKeys(raw: unknown): Partial<AiApiKeys> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Partial<AiApiKeys> = {};
  for (const p of CLOUD_AI_PROVIDERS) {
    const v = (raw as Record<string, unknown>)[p];
    if (typeof v === "string" && v.trim() && !isRedactedSecret(v)) out[p] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

export function activeCloudProvider(provider: string): CloudAiProvider | null {
  if (provider === "claude" || provider === "gemini" || provider === "deepseek") return provider;
  return null;
}

export function resolveAiApiKeyForProvider(settings: Pick<RuntimeSettings, "aiProvider" | "aiApiKeys" | "aiApiKey">): string {
  const cloud = activeCloudProvider(settings.aiProvider);
  if (!cloud) return "";
  return settings.aiApiKeys?.[cloud] || settings.aiApiKey || "";
}
