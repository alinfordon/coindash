import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RuntimeSettings } from "./settings";

export type AIProvider = "claude" | "gemini" | "ollama";

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
    const g = new GoogleGenerativeAI(settings.aiApiKey);
    const m = g.getGenerativeModel({ model });
    const r = await m.generateContent(prompt);
    const text = r.response.text();
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
  rsi15m?: number;
  macdHist15m?: number;
  trend15m?: string;
  priceVsEma20_15m?: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}) {
  const tf15 =
    d.rsi15m != null
      ? `
TECHNICAL DATA (15M timeframe, last 100 candles — entry timing):
RSI(14): ${num(d.rsi15m)}
MACD histogram: ${num(d.macdHist15m)}
Price vs EMA20: ${num(d.priceVsEma20_15m)}%
Trend (last 5 candles): ${d.trend15m ?? "n/a"}
`
      : "";

  return `You are an expert crypto trading analyst. Analyze ${d.pair} and provide a trading recommendation.

TECHNICAL DATA (1H timeframe, last 100 candles — trend context):
Current Price: ${d.price}
RSI(14): ${num(d.rsi)}
MACD: value=${num(d.macdValue)}, signal=${num(d.macdSignal)}, histogram=${num(d.macdHist)}
Bollinger Bands: upper=${num(d.bbUpper)}, middle=${num(d.bbMiddle)}, lower=${num(d.bbLower)}
EMA20: ${num(d.ema20)}, EMA50: ${num(d.ema50)}
Price vs EMA20: ${num(d.priceVsEma20)}%
Price vs EMA50: ${num(d.priceVsEma50)}%
${tf15}
MARKET DATA:
24h Change: ${num(d.change24h)}%
24h Volume: $${num(d.volume24h, 0)}
24h High: ${num(d.high24h)}, Low: ${num(d.low24h)}

Respond ONLY with valid JSON:
{
  "recommendation": "STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL",
  "confidence": 0-100,
  "technicalScore": -100 to 100,
  "reasoning": "concise explanation max 150 chars",
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
