import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RuntimeSettings } from "./settings";
import { coerceModelForProvider, formatGeminiError, resolveGeminiModel } from "./aiModels";
import {
  DEFAULT_ANALYSIS_INDICATORS,
  type AnalysisIndicatorsConfig,
} from "./analysisIndicators";
import type { ElliottWaveSnapshot, FibonacciSnapshot } from "./indicators";

function fibonacciLines(f: FibonacciSnapshot, tfLabel: string): string[] {
  return [
    `Fibonacci ${tfLabel} (swing ${f.swingDirection}, ${f.lookbackCandles} candles): high=${num(f.swingHigh)}, low=${num(f.swingLow)}`,
    `Niveluri ${tfLabel}: 23.6%=${num(f.levels["0.236"])}, 38.2%=${num(f.levels["0.382"])}, 50%=${num(f.levels["0.5"])}, 61.8%=${num(f.levels["0.618"])}, 78.6%=${num(f.levels["0.786"])}`,
    `Preț lângă ${f.nearestLevel} · retracement ~${num(f.retracementPct, 1)}%`,
  ];
}

function elliottLines(e: ElliottWaveSnapshot, tfLabel: string): string[] {
  return [
    `Elliott Wave ${tfLabel}: fază=${e.phase}, valuri=${e.waveLegs}, pivoturi=${e.pivotCount}, ultimă mișcare=${num(e.lastMovePct, 2)}%`,
    `Elliott ${tfLabel}: ${e.summary}`,
  ];
}

export type AIProvider = "claude" | "gemini" | "deepseek" | "ollama";

const DEEPSEEK_DEFAULT_BASE = "https://api.deepseek.com";

export type AIResponse = {
  text: string;
  provider: AIProvider;
  model: string;
  latencyMs: number;
};

export async function callAI(
  prompt: string,
  settings: RuntimeSettings,
  opts: { role?: "default" | "analysis"; maxTokens?: number } = {}
): Promise<AIResponse> {
  const t = Date.now();
  const maxTokens = opts.maxTokens ?? 1024;
  const { provider, model } = resolveAiProfile(settings, opts.role ?? "default");

  if (provider === "claude") {
    if (!settings.aiApiKey) throw new Error("Missing Anthropic API key");
    const client = new Anthropic({ apiKey: settings.aiApiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
    return { text, provider, model, latencyMs: Date.now() - t };
  }

  if (provider === "gemini") {
    if (!settings.aiApiKey) throw new Error("Missing Google API key");
    const { model: geminiModel, remappedFrom } = resolveGeminiModel(model);
    const g = new GoogleGenerativeAI(settings.aiApiKey);
    const m = g.getGenerativeModel({ model: geminiModel });
    try {
      const r = await m.generateContent(prompt);
      const text = r.response.text();
      return {
        text,
        provider,
        model: remappedFrom ? `${geminiModel} (was ${remappedFrom})` : geminiModel,
        latencyMs: Date.now() - t,
      };
    } catch (e) {
      throw new Error(formatGeminiError(remappedFrom ?? model, e));
    }
  }

  if (provider === "deepseek") {
    if (!settings.aiApiKey) throw new Error("Missing DeepSeek API key");
    const base = (settings.deepseekBaseUrl || DEEPSEEK_DEFAULT_BASE).replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.aiApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek ${res.status}: ${err.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("DeepSeek returned empty response");
    return { text, provider, model, latencyMs: Date.now() - t };
  }

  if (provider === "ollama") {
    const url = (settings.ollamaUrl || "http://localhost:11434").replace(/\/$/, "");
    const res = await fetch(`${url}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { text: data.response || "", provider, model, latencyMs: Date.now() - t };
  }

  throw new Error(`Unknown AI provider: ${provider}`);
}

/** Model used for market scan vs position checks (same provider / API key). */
export function resolveAiProfile(
  settings: RuntimeSettings,
  role: "default" | "analysis" = "default"
): { provider: AIProvider; model: string } {
  const provider = settings.aiProvider;
  if (role === "analysis") {
    const analysis = settings.analysisAiModel?.trim();
    if (analysis) {
      return { provider, model: coerceModelForProvider(provider, analysis, "analysis").model };
    }
  }
  return { provider, model: coerceModelForProvider(provider, settings.aiModel || "", role).model };
}

/** Fail fast before scanning dozens of pairs. */
export function assertAiReady(settings: RuntimeSettings, role: "default" | "analysis" = "analysis"): void {
  const { provider, model } = resolveAiProfile(settings, role);
  if (provider === "ollama") {
    if (!settings.ollamaUrl?.trim()) throw new Error("Ollama URL is not configured in Settings");
    if (!model?.trim()) throw new Error("Ollama model name is empty in Settings");
    return;
  }
  if (!settings.aiApiKey?.trim()) {
    const label =
      provider === "claude" ? "Anthropic" : provider === "gemini" ? "Google" : provider === "deepseek" ? "DeepSeek" : "AI";
    throw new Error(`Missing ${label} API key in Settings (AI provider: ${provider})`);
  }
  if (!model?.trim()) throw new Error(`AI model name is empty for provider ${provider}`);
}

export function safeParseJson<T = any>(raw: string): T | null {
  if (!raw) return null;
  // Strip code fences
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "");
  }
  // Find the first `{` and the last `}`
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function buildAnalysisPrompt(d: {
  pair: string;
  trendInterval: string;
  entryInterval?: string;
  price: number;
  enabled?: AnalysisIndicatorsConfig;
  rsi?: number;
  macdValue?: number;
  macdSignal?: number;
  macdHist?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  ema20?: number;
  ema50?: number;
  priceVsEma20?: number;
  priceVsEma50?: number;
  fibonacci?: FibonacciSnapshot | null;
  elliottWave?: ElliottWaveSnapshot | null;
  fibonacciEntry?: FibonacciSnapshot | null;
  elliottWaveEntry?: ElliottWaveSnapshot | null;
  rsiEntry?: number;
  macdHistEntry?: number;
  trendEntry?: string;
  priceVsEma20Entry?: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}) {
  const enabled = d.enabled ?? DEFAULT_ANALYSIS_INDICATORS;
  const trendTf = d.trendInterval.toUpperCase();
  const entryTf = d.entryInterval?.toUpperCase();
  const trendLines: string[] = [`Preț curent: ${d.price}`];

  if (enabled.rsi && d.rsi != null) trendLines.push(`RSI(14) [${trendTf}]: ${num(d.rsi)}`);
  if (enabled.macd && d.macdValue != null) {
    trendLines.push(
      `MACD [${trendTf}]: value=${num(d.macdValue)}, signal=${num(d.macdSignal)}, histogram=${num(d.macdHist)}`
    );
  }
  if (enabled.bollinger && d.bbUpper != null) {
    trendLines.push(
      `Bollinger [${trendTf}]: upper=${num(d.bbUpper)}, middle=${num(d.bbMiddle)}, lower=${num(d.bbLower)}`
    );
  }
  if (enabled.ema && d.ema20 != null) {
    trendLines.push(`EMA20/50 [${trendTf}]: ${num(d.ema20)} / ${num(d.ema50)}`);
    trendLines.push(`Preț vs EMA20 [${trendTf}]: ${num(d.priceVsEma20)}%`);
    trendLines.push(`Preț vs EMA50 [${trendTf}]: ${num(d.priceVsEma50)}%`);
  }
  if (enabled.fibonacci && d.fibonacci) trendLines.push(...fibonacciLines(d.fibonacci, trendTf));
  if (enabled.elliottWave && d.elliottWave) trendLines.push(...elliottLines(d.elliottWave, trendTf));

  const entryParts: string[] = [];
  if (enabled.rsi && d.rsiEntry != null) entryParts.push(`RSI(14) [${entryTf}]: ${num(d.rsiEntry)}`);
  if (enabled.macd && d.macdHistEntry != null) {
    entryParts.push(`MACD histogram [${entryTf}]: ${num(d.macdHistEntry)}`);
  }
  if (enabled.ema && d.priceVsEma20Entry != null) {
    entryParts.push(`Preț vs EMA20 [${entryTf}]: ${num(d.priceVsEma20Entry)}%`);
  }
  if (d.trendEntry) entryParts.push(`Trend ultimele 5 candle [${entryTf}]: ${d.trendEntry}`);
  if (enabled.fibonacci && d.fibonacciEntry) entryParts.push(...fibonacciLines(d.fibonacciEntry, entryTf ?? "ENTRY"));
  if (enabled.elliottWave && d.elliottWaveEntry) {
    entryParts.push(...elliottLines(d.elliottWaveEntry, entryTf ?? "ENTRY"));
  }

  const entryBlock =
    entryParts.length && d.entryInterval
      ? `
DATE TEHNICE ENTRY (${entryTf}, ultimele 100 candle-uri — timing intrare):
${entryParts.join("\n")}
`
      : "";

  const token = (() => {
    if (!/USDC$/i.test(d.pair)) return d.pair;
    const base = d.pair.replace(/USDC$/i, "");
    return !base || base.length <= 2 ? d.pair : base;
  })();

  return `Ești un analist crypto expert. Analizează ${d.pair} și oferă o recomandare de trading.

Timeframes configurate: trend=${trendTf}, entry=${entryTf ?? "n/a"}.

DATE TEHNICE TREND (${trendTf}, ultimele 100 candle-uri — context trend):
${trendLines.join("\n")}
${entryBlock}
PIAȚĂ:
Variație 24h: ${num(d.change24h)}%
Volum 24h: $${num(d.volume24h, 0)}
Max 24h: ${num(d.high24h)}, Min 24h: ${num(d.low24h)}

REGULI OBLIGATORII:
- "reasoning" și fiecare element din "keyFactors" TREBUIE să fie în limba română (nu folosi engleza).
- Păstrează în engleză doar cheile JSON și valorile enum: recommendation, riskLevel.
- Pentru stablecoin-uri (ex. ${token} legat de USD): explică în română lipsa potențialului de creștere.
- Folosește explicit timeframe-urile ${trendTf} (trend) și ${entryTf ?? "entry"} (intrare) când interpretezi indicatorii.
${enabled.fibonacci ? "- Integrează nivelurile Fibonacci pe ambele timeframes dacă sunt furnizate.\n" : ""}${enabled.elliottWave ? "- Ia în considerare structura Elliott Wave pe trend și entry.\n" : ""}
Exemplu pentru stablecoin:
"reasoning": "${token} este un stablecoin legat de dolar. Datele actuale arată abatere minimă, reflectând stabilitatea pieței, fără potențial de creștere."

Răspunde DOAR cu JSON valid:
{
  "recommendation": "STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL",
  "confidence": 0-100,
  "technicalScore": -100 to 100,
  "reasoning": "explicație concisă în română, max 150 caractere",
  "keyFactors": ["factor1", "factor2", "factor3"],
  "riskLevel": "LOW|MEDIUM|HIGH"
}`;
}

export function buildPositionCheckPrompt(d: {
  pair: string;
  entry: number;
  current: number;
  pnlPct: number;
  pnlUsdc: number;
  durationMin: number;
  stopLoss: number;
  takeProfit: number;
  rsi: number;
  macdHist: number;
  trend: string;
}) {
  return `You are a crypto risk manager. Evaluate this open position:

POSITION: ${d.pair} LONG
Entry: $${d.entry} | Current: $${d.current}
P&L: ${num(d.pnlPct)}% ($${num(d.pnlUsdc)})
Duration: ${d.durationMin} minutes
Stop Loss: $${d.stopLoss} | Take Profit: $${d.takeProfit}

CURRENT TECHNICALS:
RSI: ${num(d.rsi)} | MACD histogram: ${num(d.macdHist)}
Price trend (last 5 candles): ${d.trend}

Decision options: HOLD (let OCO work), SELL_NOW (close immediately), WAIT_MORE
Respond ONLY with JSON:
{
  "decision": "HOLD|SELL_NOW|WAIT_MORE",
  "confidence": 0-100,
  "reasoning": "max 100 chars"
}`;
}

function num(n: number | undefined, digits = 4) {
  if (n === undefined || n === null || Number.isNaN(n)) return "n/a";
  return Number(n).toFixed(digits);
}
