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
