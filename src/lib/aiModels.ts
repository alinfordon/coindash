/** Google AI Studio (generativelanguage.googleapis.com) model IDs. */
export const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
] as const;

export const DEEPSEEK_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;

const DEEPSEEK_MODEL_ALIASES: Record<string, string> = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
};

export type AiProviderId = "claude" | "gemini" | "deepseek" | "ollama";

export function modelMatchesProvider(provider: string, model: string): boolean {
  const m = model.trim().toLowerCase();
  if (!m) return true;
  if (provider === "ollama") return true;
  if (provider === "gemini") return m.startsWith("gemini");
  if (provider === "claude") return m.startsWith("claude");
  if (provider === "deepseek") return m.startsWith("deepseek");
  return false;
}

export function defaultModelForProvider(provider: string, role: "default" | "analysis" = "default"): string {
  void role;
  switch (provider) {
    case "gemini":
      return "gemini-2.5-flash-lite";
    case "claude":
      return "claude-sonnet-4-5";
    case "deepseek":
      return "deepseek-v4-flash";
    case "ollama":
      return "llama3.2";
    default:
      return "";
  }
}

/** Pick a valid model ID for the active provider (fixes cross-provider leftovers in DB). */
export function coerceModelForProvider(
  provider: string,
  model: string,
  role: "default" | "analysis" = "default"
): { model: string; coercedFrom?: string } {
  const trimmed = model.trim();
  if (provider === "deepseek" && trimmed) {
    const mapped = DEEPSEEK_MODEL_ALIASES[trimmed];
    if (mapped) return { model: mapped, coercedFrom: trimmed };
  }
  if (trimmed && modelMatchesProvider(provider, trimmed)) {
    return { model: trimmed };
  }
  if (trimmed) {
    return { model: defaultModelForProvider(provider, role), coercedFrom: trimmed };
  }
  return { model: defaultModelForProvider(provider, role) };
}

/** DB patch when saved models belong to a different provider. */
export function providerModelMigrationPatch(
  provider: string,
  aiModel: string,
  analysisAiModel?: string
): { aiModel?: string; analysisAiModel?: string } | null {
  if (provider === "ollama") return null;
  const patch: { aiModel?: string; analysisAiModel?: string } = {};

  const main = coerceModelForProvider(provider, aiModel || "", "default");
  if (main.coercedFrom) patch.aiModel = main.model;

  const analysis = analysisAiModel?.trim();
  if (analysis) {
    const entry = coerceModelForProvider(provider, analysis, "analysis");
    if (entry.coercedFrom) {
      // Empty analysis model → fall back to position model for this provider.
      patch.analysisAiModel = modelMatchesProvider(provider, analysis) ? entry.model : "";
    }
  }

  return Object.keys(patch).length ? patch : null;
}

/** Names that 400 on AI Studio — map to a working equivalent. */
const GEMINI_MODEL_ALIASES: Record<string, string> = {
  "gemini-3.1-flash-lite": "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview": "gemini-2.5-flash-lite",
  "gemini-3-flash-preview": "gemini-3.5-flash",
};

export function resolveGeminiModel(model: string): { model: string; remappedFrom?: string } {
  const trimmed = model.trim();
  const mapped = GEMINI_MODEL_ALIASES[trimmed];
  if (mapped) return { model: mapped, remappedFrom: trimmed };
  return { model: trimmed };
}

/** Returns DB patch when saved Gemini model IDs need migration. */
export function geminiModelMigrationPatch(
  provider: string,
  aiModel: string,
  analysisAiModel?: string
): { aiModel?: string; analysisAiModel?: string } | null {
  if (provider !== "gemini") return null;
  const patch: { aiModel?: string; analysisAiModel?: string } = {};
  const main = resolveGeminiModel(aiModel || "");
  if (main.remappedFrom) patch.aiModel = main.model;
  const analysis = analysisAiModel?.trim();
  if (analysis) {
    const entry = resolveGeminiModel(analysis);
    if (entry.remappedFrom) patch.analysisAiModel = entry.model;
  }
  return Object.keys(patch).length ? patch : null;
}

export function formatGeminiError(model: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/400|404|not found|invalid/i.test(msg)) {
    return (
      `Gemini model "${model}" is not available on your API key. ` +
      `Try gemini-2.5-flash-lite (fast) or gemini-3.5-flash in Settings → AI. ` +
      `(${msg.slice(0, 140)})`
    );
  }
  return msg.slice(0, 240);
}
