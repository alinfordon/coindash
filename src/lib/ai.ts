import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RuntimeSettings } from "./settings";
import { formatGeminiError, resolveGeminiModel } from "./aiModels";

export type AIProvider = "claude" | "gemini" | "zai" | "ollama";

const ZAI_DEFAULT_BASE = "https://api.z.ai/api/paas/v4";

export type AIResponse = {
  text: string;
  provider: AIProvider;
  model: string;
  latencyMs: number;
};

export async function callAI(
  prompt: string,
  settings: RuntimeSettings,
  opts: { role?: "default" | "analysis" } = {}
): Promise<AIResponse> {
  const t = Date.now();
  const { provider, model } = resolveAiProfile(settings, opts.role ?? "default");

  if (provider === "claude") {
    if (!settings.aiApiKey) throw new Error("Missing Anthropic API key");
    const client = new Anthropic({ apiKey: settings.aiApiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 1024,
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

  if (provider === "zai") {
    if (!settings.aiApiKey) throw new Error("Missing Z.AI API key");
    const base = (settings.zaiBaseUrl || ZAI_DEFAULT_BASE).replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.aiApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Z.AI ${res.status}: ${err.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("Z.AI returned empty response");
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
  if (role === "analysis") {
    const model = settings.analysisAiModel?.trim();
    if (model) return { provider: settings.aiProvider, model };
  }
  return { provider: settings.aiProvider, model: settings.aiModel };
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
    const label = provider === "claude" ? "Anthropic" : provider === "gemini" ? "Google" : "Z.AI";
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
  rsi: number;
  macdValue: number;
  macdSignal: number;
  macdHist: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  ema20: number;
  ema50: number;
  priceVsEma20: number;
  priceVsEma50: number;
  rsiEntry?: number;
  macdHistEntry?: number;
  trendEntry?: string;
  priceVsEma20Entry?: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}) {
  const entryBlock =
    d.rsiEntry != null
      ? `
TECHNICAL DATA (${d.entryInterval?.toUpperCase() ?? "ENTRY"} timeframe, last 100 candles — entry timing):
RSI(14): ${num(d.rsiEntry)}
MACD histogram: ${num(d.macdHistEntry)}
Price vs EMA20: ${num(d.priceVsEma20Entry)}%
Trend (last 5 candles): ${d.trendEntry ?? "n/a"}
`
      : "";

  const token = (() => {
    if (!/USDC$/i.test(d.pair)) return d.pair;
    const base = d.pair.replace(/USDC$/i, "");
    return !base || base.length <= 2 ? d.pair : base;
  })();

  return `Ești un analist crypto expert. Analizează ${d.pair} și oferă o recomandare de trading.

DATE TEHNICE (${d.trendInterval.toUpperCase()}, ultimele 100 candle-uri — context trend):
Preț curent: ${d.price}
RSI(14): ${num(d.rsi)}
MACD: value=${num(d.macdValue)}, signal=${num(d.macdSignal)}, histogram=${num(d.macdHist)}
Bollinger: upper=${num(d.bbUpper)}, middle=${num(d.bbMiddle)}, lower=${num(d.bbLower)}
EMA20: ${num(d.ema20)}, EMA50: ${num(d.ema50)}
Preț vs EMA20: ${num(d.priceVsEma20)}%
Preț vs EMA50: ${num(d.priceVsEma50)}%
${entryBlock}
PIAȚĂ:
Variație 24h: ${num(d.change24h)}%
Volum 24h: $${num(d.volume24h, 0)}
Max 24h: ${num(d.high24h)}, Min 24h: ${num(d.low24h)}

REGULI OBLIGATORII:
- "reasoning" și fiecare element din "keyFactors" TREBUIE să fie în limba română (nu folosi engleza).
- Păstrează în engleză doar cheile JSON și valorile enum: recommendation, riskLevel.
- Pentru stablecoin-uri (ex. ${token} legat de USD): explică în română lipsa potențialului de creștere.

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
