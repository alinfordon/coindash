import type { RuntimeSettings } from "./settings";
import { callAI, safeParseJson } from "./ai";

const RO_MARKERS = /\b(este|sunt|fără|pieței|semnal|arată|potențial|cumpărare|vânzare|lateral|neutru|reflectând|stabilitate|abatere|legat|dolar)\b|[ăâîșțĂÂÎȘȚ]/i;
const EN_MARKERS = /\b(the|is a|with no|shows|reflecting|current data|growth potential|buy signal|sell signal)\b/i;

export function isLikelyRomanian(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (RO_MARKERS.test(t)) return true;
  return !EN_MARKERS.test(t);
}

const PHRASE_MAP: [RegExp, string][] = [
  [/is a stablecoin pegged to the dollar/gi, "este un stablecoin legat de dolar"],
  [/current data shows minimal deviation/gi, "datele actuale arată abatere minimă"],
  [
    /reflecting standard market stability with no growth potential/gi,
    "reflectând stabilitatea standardă a pieței, fără potențial de creștere",
  ],
  [/no clear (buy|entry) signal/gi, "fără semnal clar de $1"],
  [/no growth potential/gi, "fără potențial de creștere"],
  [/market stability/gi, "stabilitate de piață"],
  [/minimal deviation/gi, "abatere minimă"],
  [/overbought/gi, "supracumpărat"],
  [/oversold/gi, "supravândut"],
  [/bullish/gi, "bullish"],
  [/bearish/gi, "bearish"],
  [/sideways/gi, "lateral"],
  [/momentum/gi, "momentum"],
  [/histogram/gi, "histogramă MACD"],
  [/below zero/gi, "sub zero"],
  [/above zero/gi, "peste zero"],
  [/trend is/gi, "trendul este"],
  [/price is/gi, "prețul este"],
  [/weak/gi, "slab"],
  [/strong/gi, "puternic"],
];

function tokenLabel(pair: string): string {
  if (!/USDC$/i.test(pair)) return pair;
  const base = pair.replace(/USDC$/i, "");
  // Keep full symbol for short bases (e.g. UUSDC → "U" would be wrong).
  if (!base || base.length <= 2) return pair;
  return base;
}

function tryStablecoinTemplate(text: string, pair: string): string | null {
  if (!/stablecoin|pegged.*dollar|minimal deviation|market stability|no growth potential/i.test(text)) {
    return null;
  }
  const token = tokenLabel(pair);
  return `${token} este un stablecoin legat de dolar. Datele actuale arată abatere minimă, reflectând stabilitatea standardă a pieței, fără potențial de creștere.`;
}

function applyPhraseMap(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PHRASE_MAP) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/** Fast, sync localization for API/UI (no extra AI call). */
export function localizeAnalysisDisplay(
  reasoning: string,
  pair: string,
  keyFactors: string[] = []
): { reasoning: string; keyFactors: string[] } {
  const raw = reasoning?.trim() ?? "";
  if (!raw || isLikelyRomanian(raw)) {
    return {
      reasoning: raw,
      keyFactors: keyFactors.map((k) => (isLikelyRomanian(k) ? k : applyPhraseMap(k))),
    };
  }

  const stable = tryStablecoinTemplate(raw, pair);
  const localizedReasoning = stable ?? applyPhraseMap(raw);

  return {
    reasoning: localizedReasoning,
    keyFactors: keyFactors.map((k) => {
      if (isLikelyRomanian(k)) return k;
      return applyPhraseMap(k);
    }),
  };
}

function buildRomanianTranslatePrompt(reasoning: string, keyFactors: string[]) {
  return `Tradu în limba română câmpurile de mai jos. Păstrează termenii tehnici (RSI, MACD, EMA, HOLD, BUY).
Răspunde DOAR cu JSON valid:
{"reasoning":"...","keyFactors":["..."]}

Text:
${JSON.stringify({ reasoning, keyFactors })}`;
}

const translationCache = new Map<string, { reasoning: string; keyFactors: string[] }>();

/** Ensures Romanian copy when saving new analyses (AI fallback if still English). */
export async function ensureRomanianAnalysisCopy(
  settings: RuntimeSettings,
  copy: { reasoning?: string; keyFactors?: string[]; pair?: string }
): Promise<{ reasoning: string; keyFactors: string[] }> {
  const reasoning = copy.reasoning?.trim() ?? "";
  const keyFactors = copy.keyFactors ?? [];
  const heuristic = localizeAnalysisDisplay(reasoning, copy.pair ?? "", keyFactors);
  if (isLikelyRomanian(heuristic.reasoning)) return heuristic;

  const cacheKey = `${reasoning}|${keyFactors.join("\n")}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  try {
    const ai = await callAI(buildRomanianTranslatePrompt(reasoning, keyFactors), settings, {
      role: "analysis",
    });
    const parsed = safeParseJson<{ reasoning?: string; keyFactors?: string[] }>(ai.text);
    if (parsed?.reasoning?.trim()) {
      const result = {
        reasoning: parsed.reasoning.trim(),
        keyFactors: parsed.keyFactors?.length ? parsed.keyFactors : heuristic.keyFactors,
      };
      translationCache.set(cacheKey, result);
      return result;
    }
  } catch {
    /* use heuristic */
  }

  return heuristic;
}
