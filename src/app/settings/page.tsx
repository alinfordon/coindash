"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { AlertTriangle, Save, PlugZap, Zap, Pause, Ban, Plus, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { normalizePairBlacklistEntries } from "@/lib/pairBlacklistCore";
import {
  ANALYSIS_INTERVAL_OPTIONS,
  intervalRank,
  normalizeAnalysisInterval,
  normalizeAnalysisIntervalPair,
} from "@/lib/analysisIntervals";
import { GEMINI_MODELS, DEEPSEEK_MODELS, geminiModelMigrationPatch, providerModelMigrationPatch } from "@/lib/aiModels";
import { type CloudAiProvider, EMPTY_AI_API_KEYS } from "@/lib/aiApiKeys";
import { SWR_SETTINGS } from "@/lib/swrDefaults";
import {
  ANALYSIS_INDICATOR_DEFS,
  normalizeAnalysisIndicators,
} from "@/lib/analysisIndicators";
import { ExchangeConnectionsCard } from "@/components/settings/ExchangeConnectionsCard";

const MODELS = {
  claude: ["claude-opus-4-5", "claude-opus-4-8", "claude-sonnet-4-5", "claude-haiku-4-5", "claude-sonnet-4-6"],
  gemini: [...GEMINI_MODELS],
  deepseek: [...DEEPSEEK_MODELS],
  ollama: ["llama3.2", "qwen3.5:397b-cloud", "qwen3.5"],
} as const;

type AiProviderId = keyof typeof MODELS;

const AI_PROVIDERS: AiProviderId[] = ["claude", "gemini", "deepseek", "ollama"];

function providerSubtitle(p: AiProviderId): string {
  if (p === "claude") return "Anthropic Claude";
  if (p === "gemini") return "Google Gemini";
  if (p === "deepseek") return "DeepSeek API";
  return "Local (Ollama)";
}

function apiKeyLabel(provider: string): string {
  if (provider === "claude") return "Anthropic API Key";
  if (provider === "gemini") return "Google API Key";
  if (provider === "deepseek") return "DeepSeek API Key";
  return "API Key";
}

const TIMEZONES = [
  "Europe/Bucharest",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Dubai",
];

const SETTING_TIPS: Record<string, string> = {
  aiProviderClaude:
    "Folosește API-ul Anthropic (Claude). Același API key pentru analiză și verificarea pozițiilor.",
  aiProviderGemini:
    "Folosește Google Gemini. Potrivit pentru cost redus; poți seta un model mai puternic doar pentru Analysis Cron.",
  aiProviderOllama:
    "Rulează modele local via Ollama. Fără cost API cloud; necesită serverul Ollama pornit.",
  aiProviderDeepseek:
    "DeepSeek — API compatibil OpenAI. Cheie de la platform.deepseek.com. deepseek-chat e rapid; deepseek-reasoner pentru raționament complex.",
  deepseekBaseUrl:
    "Endpoint DeepSeek OpenAI-compatible. Implicit: https://api.deepseek.com",
  aiApiKey: "Cheia API a providerului selectat. Fiecare provider (Claude, Gemini, DeepSeek) își păstrează cheia separat în DB.",
  ollamaUrl: "URL-ul serverului Ollama (ex. http://localhost:11434).",
  aiModelPosition:
    "Modelul AI pentru Position Cron (la ~45 min): evaluează poziții deschise — HOLD sau SELL_NOW. Recomandat model rapid/ieftin.",
  aiModelAnalysis:
    "Modelul AI pentru Analysis Cron (la ~120 min): scan piață + semnale BUY. Gol = același ca Position. Recomandat model mai capabil.",
  analysisTrendInterval:
    "Timeframe principal pentru indicatori (EMA, MACD, Bollinger) trimiși la AI. Definește trendul — ex. 1h swing, 4h position.",
  analysisEntryInterval:
    "Timeframe scurt pentru timing intrare (RSI, trend). Folosit și la Position Cron. Trebuie ≤ timeframe trend.",
  analysisIndicators:
    "Alege ce indicatori tehnici sunt calculați și trimiși la AI în Analysis Cron. Minim un indicator activ.",
  pilotActive:
    "Comutator master: OFF oprește toate cron-urile automate (analiză + verificare poziții). Nu închide poziții existente.",
  positionCheckCronActive:
    "La fiecare ~45 minute verifică TP/SL, reconcile cu Binance și poate închide poziții via AI dacă confidence ≥ 80%.",
  analysisCronActive:
    "La fiecare ~120 minute scanează top perechi USDC, calculează TA, întreabă AI-ul și poate deschide poziții noi.",
  dryRun:
    "Simulare: calculează semnale și salvează în DB fără ordine reale pe Binance. Util pentru testare.",
  maxOpenPairs:
    "Număr maxim de poziții LONG deschise simultan. Limită de expunere și diversificare.",
  maxUsdcPerOrder:
    "USDC alocat per ordin MARKET BUY. Analysis Cron nu rulează (programat) dacă USDC liber < această valoare.",
  stopLossPercent:
    "Distanța SL sub prețul de intrare (%). Binance plasează OCO cu acest stop la deschidere.",
  riskRewardRatio:
    "Raport risc/recompensă: TP minim = SL × acest raport. Modifică automat Take Profit când îl schimbi.",
  takeProfitPercent:
    "Distanța TP deasupra intrării (%). Efectiv: max(takeProfitPercent, SL × riskRewardRatio).",
  minConfidence:
    "Prag minim confidence de la AI (0–100) ca un semnal BUY/STRONG_BUY să fie luat în considerare pentru deschidere.",
  minTechnicalScore:
    "Scor tehnic minim (-100…100) din răspunsul AI. Entry gate folosește și filtre locale (EMA, RSI, MACD).",
  maxPump24hPct:
    "Blochează intrări dacă perechea a urcat peste X% în 24h — evită cumpărarea în vârf (FOMO).",
  slCooldownMinutes:
    "După închidere cu SL_HIT, aceeași pereche nu poate fi redeschisă automat în acest interval.",
  tpReopenCooldownMinutes:
    "După TP_HIT, pauză mai scurtă înainte de a permite din nou deschiderea pe aceeași pereche.",
  entryGateEnabled:
    "Filtre tehnice locale înainte de open: trend EMA/MACD, RSI pe entry TF, fără trend falling, anti-pump.",
  displayTimezone:
    "Fus orar pentru „azi” în dashboard (ex. Today P&L) și rapoarte calendar.",
  pairBlacklist:
    "Perechi excluse din Analysis Cron (nu se deschid automat). Nu închide poziții deja deschise.",
  binanceApiKey: "Cheia API Binance cu permisiuni de citire + trading SPOT. Stocată criptat.",
  binanceApiSecret: "Secretul API Binance. Nu se afișează după salvare.",
  binanceTestnet:
    "ON = Binance Testnet (fără bani reali). OFF = cont live — ordine reale. Doar pentru Binance activ.",
  krakenApiKey: "Cheia API Kraken cu permisiuni Query + Trade (Spot). Stocată criptat.",
  krakenApiSecret: "Secretul API Kraken (format base64). Nu se afișează după salvare.",
  activeExchange: "Un singur exchange poate fi activ — trading și sync folosesc conexiunea selectată.",
  telegramBotToken: "Token de la @BotFather pentru notificări deschideri/închideri.",
  telegramChatId: "ID-ul chat-ului sau canalului unde primești alertele botului.",
};

export default function SettingsPage() {
  const { data, mutate } = useSWR<any>("/api/settings", undefined, SWR_SETTINGS);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [confirmBinance, setConfirmBinance] = useState(false);
  const [blacklistDraft, setBlacklistDraft] = useState("");

  useEffect(() => {
    if (data && !form) {
      const next = {
        ...data,
        pairBlacklist: normalizePairBlacklistEntries(data.pairBlacklist),
        aiApiKeys: {
          ...EMPTY_AI_API_KEYS,
          ...(data.aiApiKeys || {}),
        },
        analysisIndicators: normalizeAnalysisIndicators(data.analysisIndicators),
      };
      if (next.aiProvider === "zai") {
        next.aiProvider = "deepseek";
        next.deepseekBaseUrl = next.deepseekBaseUrl || "https://api.deepseek.com";
        if (String(next.aiModel || "").startsWith("glm")) next.aiModel = "deepseek-chat";
        if (String(next.analysisAiModel || "").startsWith("glm")) next.analysisAiModel = "deepseek-chat";
      }
      const geminiPatch = geminiModelMigrationPatch(
        next.aiProvider,
        next.aiModel,
        next.analysisAiModel
      );
      if (geminiPatch) {
        Object.assign(next, geminiPatch);
        toast.info(
          `Gemini model updated: ${Object.entries(geminiPatch)
            .map(([k, v]) => `${k} → ${v}`)
            .join(", ")}. Save to persist.`,
          { duration: 8000 }
        );
      }
      const modelPatch = providerModelMigrationPatch(next.aiProvider, next.aiModel, next.analysisAiModel);
      if (modelPatch) {
        Object.assign(next, modelPatch);
        toast.info(
          `AI model aligned with ${next.aiProvider}: ${Object.entries(modelPatch)
            .map(([k, v]) => `${k} → ${v || "(same as position)"}`)
            .join(", ")}. Save to persist.`,
          { duration: 8000 }
        );
      }
      setForm(next);
    }
  }, [data, form]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(data), [form, data]);

  function pushBlacklistDraft() {
    const parts = blacklistDraft.split(/[\s,]+/).filter(Boolean);
    if (!parts.length) return;
    set({
      pairBlacklist: normalizePairBlacklistEntries([
        ...normalizePairBlacklistEntries(form.pairBlacklist),
        ...parts,
      ]),
    });
    setBlacklistDraft("");
  }

  if (!form) return <div className="text-text-muted">Loading settings…</div>;

  const set = (patch: any) => setForm({ ...form, ...patch });

  async function save() {
    const pendingExchangeSecrets =
      (form.binanceApiKey && !form.binanceApiKey.includes("•")) ||
      (form.binanceApiSecret && !form.binanceApiSecret.includes("•")) ||
      (form.krakenApiKey && !form.krakenApiKey.includes("•")) ||
      (form.krakenApiSecret && !form.krakenApiSecret.includes("•"));
    if (pendingExchangeSecrets && !confirmBinance) {
      setConfirmBinance(true);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/settings", { method: "POST", body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || `Save failed (${r.status})`);
      toast.success("Settings saved");
      setForm(j);
      mutate(j);
      setConfirmBinance(false);
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function testAi(role: "default" | "analysis" = "default") {
    const label = role === "analysis" ? "analysis model" : "position model";
    toast.loading(`Testing ${label}…`, { id: "test-ai" });
    const r = await fetch("/api/settings/test-ai", {
      method: "POST",
      body: JSON.stringify({ ...form, testRole: role }),
    });
    const j = await r.json();
    if (j.ok) toast.success(`${label} OK · ${j.model} · ${j.latencyMs}ms`, { id: "test-ai" });
    else toast.error(`${label} failed: ${j.error}`, { id: "test-ai" });
  }


  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6 max-w-9xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold">Settings</h1>
          <p className="text-sm text-text-muted mt-1 mono">SYSTEM CONFIGURATION</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="chip border-warning/40 text-warning">
              <AlertTriangle className="h-3 w-3" /> UNSAVED CHANGES
            </span>
          )}
          <button disabled={!dirty || saving} className="btn-primary" onClick={save}>
            <Save className="h-4 w-4" /> {saving ? "Saving…" : confirmBinance ? "Confirm Save" : "Save"}
          </button>
        </div>
      </div>

      {/* Row 1 — AI + integrations */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      {/* AI Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => testAi("default")}>
              <PlugZap className="h-4 w-4" /> Test position model
            </button>
            <button className="btn" onClick={() => testAi("analysis")}>
              <PlugZap className="h-4 w-4" /> Test analysis model
            </button>
          </div>
        </CardHeader>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {AI_PROVIDERS.map((p) => (
            <SettingTip
              key={p}
              tip={
                p === "claude"
                  ? SETTING_TIPS.aiProviderClaude
                  : p === "gemini"
                  ? SETTING_TIPS.aiProviderGemini
                  : p === "deepseek"
                  ? SETTING_TIPS.aiProviderDeepseek
                  : SETTING_TIPS.aiProviderOllama
              }
            >
              <button
                onClick={() =>
                  set({
                    aiProvider: p,
                    aiModel: MODELS[p][0],
                    analysisAiModel: "",
                  })
                }
                className={cn(
                  "rounded-xl border p-4 text-left transition w-full",
                  form.aiProvider === p
                    ? "border-primary/50 bg-primary/10 shadow-neon"
                    : "border-border bg-surface-2/30 hover:border-primary/30"
                )}
              >
                <div className="font-heading text-sm tracking-wider uppercase">{p === "deepseek" ? "DeepSeek" : p}</div>
                <div className="text-[11px] text-text-muted mt-1 mono">{providerSubtitle(p)}</div>
              </button>
            </SettingTip>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {form.aiProvider !== "ollama" && (
            <div>
              <SettingLabel tip={SETTING_TIPS.aiApiKey} label={apiKeyLabel(form.aiProvider)} />
              <input
                className="input mt-1"
                type="password"
                value={form.aiApiKeys?.[form.aiProvider as CloudAiProvider] ?? ""}
                onChange={(e) =>
                  set({
                    aiApiKeys: {
                      ...(form.aiApiKeys || EMPTY_AI_API_KEYS),
                      [form.aiProvider]: e.target.value,
                    },
                  })
                }
                placeholder={form.aiProvider === "deepseek" ? "DeepSeek API key" : "sk-ant-..."}
              />
            </div>
          )}
          {form.aiProvider === "deepseek" && (
            <div>
              <SettingLabel tip={SETTING_TIPS.deepseekBaseUrl} label="DeepSeek Base URL" />
              <input
                className="input mt-1 mono text-xs"
                value={form.deepseekBaseUrl ?? "https://api.deepseek.com"}
                onChange={(e) => set({ deepseekBaseUrl: e.target.value })}
                placeholder="https://api.deepseek.com"
              />
            </div>
          )}
          {form.aiProvider === "ollama" && (
            <div>
              <SettingLabel tip={SETTING_TIPS.ollamaUrl} label="Ollama URL" />
              <input
                className="input mt-1"
                value={form.ollamaUrl || ""}
                onChange={(e) => set({ ollamaUrl: e.target.value })}
              />
            </div>
          )}

          <div>
            <SettingLabel tip={SETTING_TIPS.aiModelPosition} label="Model · Position check" />
            {form.aiProvider === "ollama" ? (
              <input
                className="input mt-1"
                value={form.aiModel || ""}
                onChange={(e) => set({ aiModel: e.target.value })}
                placeholder="llama3.2"
              />
            ) : (
              <select className="input mt-1" value={form.aiModel || ""} onChange={(e) => set({ aiModel: e.target.value })}>
                {MODELS[form.aiProvider as AiProviderId]?.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-text-muted mono mt-1">Open positions · position cron</p>
          </div>

          <div>
            <SettingLabel tip={SETTING_TIPS.aiModelAnalysis} label="Model · Analysis cron" />
            {form.aiProvider === "ollama" ? (
              <input
                className="input mt-1"
                value={form.analysisAiModel ?? ""}
                onChange={(e) => set({ analysisAiModel: e.target.value })}
                placeholder={`Same as default (${form.aiModel || "—"})`}
              />
            ) : (
              <select
                className="input mt-1"
                value={form.analysisAiModel ?? ""}
                onChange={(e) => set({ analysisAiModel: e.target.value })}
              >
                <option value="">Same as default ({form.aiModel || "—"})</option>
                {MODELS[form.aiProvider as AiProviderId]?.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-text-muted mono mt-1">Market scan · trade entry signals</p>
          </div>

          <div>
            <SettingLabel tip={SETTING_TIPS.analysisTrendInterval} label="Timeframe · Trend (TA)" />
            <select
              className="input mt-1"
              value={form.analysisTrendInterval ?? "1h"}
              onChange={(e) => {
                const trend = normalizeAnalysisInterval(e.target.value, "1h");
                const { entry } = normalizeAnalysisIntervalPair(trend, form.analysisEntryInterval);
                set({ analysisTrendInterval: trend, analysisEntryInterval: entry });
              }}
            >
              {ANALYSIS_INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-text-muted mono mt-1">Context: EMA, MACD, Bollinger (100 candles)</p>
          </div>

          <div>
            <SettingLabel tip={SETTING_TIPS.analysisEntryInterval} label="Timeframe · Entry (TA)" />
            <select
              className="input mt-1"
              value={form.analysisEntryInterval ?? "15m"}
              onChange={(e) =>
                set({
                  analysisEntryInterval: normalizeAnalysisInterval(e.target.value, "15m"),
                })
              }
            >
              {ANALYSIS_INTERVAL_OPTIONS.filter(
                (o) =>
                  intervalRank(o.value) <= intervalRank(normalizeAnalysisInterval(form.analysisTrendInterval, "1h"))
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-text-muted mono mt-1">Timing: RSI, short trend · also used by position cron</p>
          </div>
        </div>
        <p className="text-[11px] text-text-muted mono mt-3 leading-relaxed">
          Binance intervals: 1m … 3d (no 4d). Entry timeframe must be ≤ trend timeframe.
        </p>

        <div className="mt-5 pt-5 border-t border-border/60">
          <SettingLabel tip={SETTING_TIPS.analysisIndicators} label="Indicatori AI · Analysis Cron" />
          <p className="text-[10px] text-text-muted mono mb-3">
            Trend: <span className="text-text">{form.analysisTrendInterval ?? "1h"}</span> · Entry:{" "}
            <span className="text-text">{form.analysisEntryInterval ?? "15m"}</span>. RSI/MACD/EMA/Fibonacci/Elliott
            pe ambele timeframes; Bollinger doar pe trend.
          </p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {ANALYSIS_INDICATOR_DEFS.map(({ id, label, tip, scope }) => {
              const cfg = normalizeAnalysisIndicators(form.analysisIndicators);
              const enabledCount = Object.values(cfg).filter(Boolean).length;
              const trendTf = form.analysisTrendInterval ?? "1h";
              const entryTf = form.analysisEntryInterval ?? "15m";
              const scopeLabel =
                scope === "trend" ? `doar ${trendTf}` : `${trendTf} + ${entryTf}`;
              return (
                <ToggleRow
                  key={id}
                  label={`${label} · ${scopeLabel}`}
                  tip={`${tip} Timeframe: ${scopeLabel}.`}
                  active={cfg[id]}
                  onChange={(v) => {
                    if (!v && enabledCount <= 1) {
                      toast.error("Trebuie să rămână cel puțin un indicator activ.");
                      return;
                    }
                    set({
                      analysisIndicators: {
                        ...cfg,
                        [id]: v,
                      },
                    });
                  }}
                />
              );
            })}
          </div>
        </div>
      </Card>

      <div className="space-y-6">
      <ExchangeConnectionsCard
        form={form}
        set={set}
        confirmExchangeSave={confirmBinance}
        onConfirmExchangeSave={setConfirmBinance}
        onSaved={(settings) => {
          setForm(settings);
          mutate(settings);
          setConfirmBinance(false);
        }}
      />

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications · Telegram</CardTitle>
        </CardHeader>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Bot Token"
            tip={SETTING_TIPS.telegramBotToken}
            type="password"
            value={form.telegramBotToken || ""}
            onChange={(v) => set({ telegramBotToken: v })}
          />
          <Field
            label="Chat ID"
            tip={SETTING_TIPS.telegramChatId}
            value={form.telegramChatId || ""}
            onChange={(v) => set({ telegramChatId: v })}
          />
        </div>
      </Card>
      </div>
      </div>

      {/* Row 2 — Trading */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Controls</CardTitle>
        </CardHeader>

        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2/30 p-4 mb-4">
          <SettingTip tip={SETTING_TIPS.pilotActive}>
            <div className="cursor-help">
              <div className="font-heading text-base inline-flex items-center gap-1.5">
                AI Pilot
                <HelpCircle className="h-3.5 w-3.5 text-text-muted" />
              </div>
              <div className="text-xs text-text-muted mono">Master switch · stops/starts all cron activity</div>
            </div>
          </SettingTip>
          <BigToggle active={!!form.pilotActive} onChange={(v) => set({ pilotActive: v })} />
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          <ToggleRow
            label="45-min Position Check Cron"
            tip={SETTING_TIPS.positionCheckCronActive}
            active={!!form.positionCheckCronActive}
            onChange={(v) => set({ positionCheckCronActive: v })}
          />
          <ToggleRow
            label="120-min Analysis Cron"
            tip={SETTING_TIPS.analysisCronActive}
            active={!!form.analysisCronActive}
            onChange={(v) => set({ analysisCronActive: v })}
          />
          <ToggleRow
            label="Dry Run Mode (no real orders)"
            tip={SETTING_TIPS.dryRun}
            active={!!form.dryRun}
            onChange={(v) => set({ dryRun: v })}
          />
          <ToggleRow
            label="Entry gate (balanced TA filters)"
            tip={SETTING_TIPS.entryGateEnabled}
            active={form.entryGateEnabled ?? true}
            onChange={(v) => set({ entryGateEnabled: v })}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
          <Field
            label="Max Open Pairs"
            tip={SETTING_TIPS.maxOpenPairs}
            type="number"
            min={1}
            max={20}
            value={form.maxOpenPairs}
            onChange={(v) => set({ maxOpenPairs: +v })}
          />
          <Field
            label="Max USDC per Order"
            tip={SETTING_TIPS.maxUsdcPerOrder}
            type="number"
            min={10}
            max={1000}
            value={form.maxUsdcPerOrder}
            onChange={(v) => set({ maxUsdcPerOrder: +v })}
          />
          <Field
            label="Stop Loss %"
            tip={SETTING_TIPS.stopLossPercent}
            type="number"
            step={0.1}
            value={form.stopLossPercent}
            onChange={(v) => set({ stopLossPercent: +v })}
          />
          <Field
            label="Risk / Reward Ratio"
            tip={SETTING_TIPS.riskRewardRatio}
            type="number"
            step={0.1}
            value={form.riskRewardRatio}
            onChange={(v) => set({ riskRewardRatio: +v, takeProfitPercent: +(form.stopLossPercent * +v).toFixed(2) })}
          />
          <Field
            label="Take Profit %"
            tip={SETTING_TIPS.takeProfitPercent}
            type="number"
            step={0.1}
            value={form.takeProfitPercent}
            onChange={(v) => set({ takeProfitPercent: +v })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <SettingLabel
              tip={SETTING_TIPS.minConfidence}
              label={
                <>
                  Min AI Confidence · <span className="text-primary">{form.minConfidence}%</span>
                </>
              }
            />
            <input
              className="w-full mt-2 accent-primary"
              type="range"
              min={0}
              max={100}
              value={form.minConfidence}
              onChange={(e) => set({ minConfidence: +e.target.value })}
            />
          </div>
          <div>
            <SettingLabel
              tip={SETTING_TIPS.minTechnicalScore}
              label={
                <>
                  Min Technical Score · <span className="text-primary">{form.minTechnicalScore ?? 40}</span>
                </>
              }
            />
            <input
              className="w-full mt-2 accent-primary"
              type="range"
              min={0}
              max={100}
              value={form.minTechnicalScore ?? 40}
              onChange={(e) => set({ minTechnicalScore: +e.target.value })}
            />
          </div>
          <Field
            label="Max 24h pump % (skip FOMO)"
            tip={SETTING_TIPS.maxPump24hPct}
            type="number"
            min={5}
            max={50}
            value={form.maxPump24hPct ?? 15}
            onChange={(v) => set({ maxPump24hPct: +v })}
          />
          <div>
            <SettingLabel tip={SETTING_TIPS.displayTimezone} label="Display Timezone" />
            <select
              className="input mt-1"
              value={form.displayTimezone || "Europe/Bucharest"}
              onChange={(e) => set({ displayTimezone: e.target.value })}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field
            label="SL cooldown (minutes)"
            tip={SETTING_TIPS.slCooldownMinutes}
            type="number"
            min={0}
            max={1440}
            value={form.slCooldownMinutes ?? 120}
            onChange={(v) => set({ slCooldownMinutes: +v })}
          />
          <Field
            label="TP reopen cooldown (min)"
            tip={SETTING_TIPS.tpReopenCooldownMinutes}
            type="number"
            min={0}
            max={480}
            value={form.tpReopenCooldownMinutes ?? 30}
            onChange={(v) => set({ tpReopenCooldownMinutes: +v })}
          />
        </div>

        <p className="text-[11px] text-text-muted mono leading-relaxed mt-4">
          Balanced: BUY/STRONG_BUY + score ≥ {form.minTechnicalScore ?? 40} (STRONG_BUY ≥{" "}
          {Math.max(30, (form.minTechnicalScore ?? 40) - 10)}), price ≥ EMA20 ({form.analysisTrendInterval ?? "1h"}),
          MACD trend ≥ 0, RSI entry {form.analysisEntryInterval ?? "15m"} 35–70, no falling entry trend, skip 24h pump &gt;{" "}
          {form.maxPump24hPct ?? 15}%.
        </p>

        <div className="rounded-xl border border-border/60 bg-surface-2/20 p-4 mt-6">
          <div className="flex items-center gap-2 mb-1">
            <Ban className="h-4 w-4 text-warning shrink-0" />
            <SettingLabel
              tip={SETTING_TIPS.pairBlacklist}
              label="Pair blacklist"
              className="text-sm font-heading tracking-wide normal-case"
            />
          </div>
          <p className="text-[11px] text-text-muted mono mb-3 leading-relaxed">
            Symbols excluded from automated trading (analysis cron). Use base ticker (BTC, ETH) or full pair (BTCUSDC). Does not close existing positions.
          </p>
          <div className="flex flex-wrap gap-2 mb-3 min-h-[28px]">
            {normalizePairBlacklistEntries(form.pairBlacklist).length === 0 ? (
              <span className="text-xs text-text-muted italic">No blocked symbols</span>
            ) : (
              normalizePairBlacklistEntries(form.pairBlacklist).map((sym) => (
                <span key={sym} className="chip border-warning/35 text-warning gap-1 pr-1">
                  <span className="mono">{sym}</span>
                  <button
                    type="button"
                    className="rounded-md p-0.5 hover:bg-warning/15 transition"
                    aria-label={`Remove ${sym}`}
                    onClick={() =>
                      set({
                        pairBlacklist: normalizePairBlacklistEntries(form.pairBlacklist).filter((x) => x !== sym),
                      })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input
              className="input flex-1 min-w-[12rem]"
              placeholder="e.g. DOGE or SOLUSDC"
              value={blacklistDraft}
              onChange={(e) => setBlacklistDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  pushBlacklistDraft();
                }
              }}
            />
            <button type="button" className="btn shrink-0" onClick={pushBlacklistDraft}>
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
      </Card>
    </div>
    </TooltipProvider>
  );
}

function BigToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!active)}
      className={cn(
        "relative h-14 w-28 rounded-full border flex items-center px-1 transition",
        active
          ? "bg-success/15 border-success shadow-neon-green"
          : "bg-surface-2 border-border"
      )}
    >
      <span
        className={cn(
          "h-11 w-11 rounded-full flex items-center justify-center transition-transform",
          active ? "translate-x-14 bg-success/90 text-bg" : "translate-x-0 bg-text-muted/40 text-text-muted"
        )}
      >
        {active ? <Zap className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
      </span>
    </button>
  );
}

function ToggleRow({
  label,
  tip,
  active,
  onChange,
}: {
  label: string;
  tip?: string;
  active: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-2/30 p-3">
      {tip ? (
        <SettingLabel label={label} tip={tip} className="text-sm normal-case tracking-normal font-sans" />
      ) : (
        <span className="text-sm">{label}</span>
      )}
      <button
        onClick={() => onChange(!active)}
        className={cn(
          "relative h-6 w-12 rounded-full border transition shrink-0",
          active ? "bg-primary/20 border-primary/60" : "bg-surface-2 border-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full transition",
            active ? "left-[26px] bg-primary shadow-neon" : "left-0.5 bg-text-muted/60"
          )}
        />
      </button>
    </div>
  );
}

function Field({
  label,
  tip,
  value,
  onChange,
  type = "text",
  step,
  min,
  max,
}: {
  label: string;
  tip?: string;
  value: any;
  onChange: (v: string) => void;
  type?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      {tip ? <SettingLabel label={label} tip={tip} /> : <span className="text-[10px] mono uppercase tracking-widest text-text-muted">{label}</span>}
      <input
        className="input mt-1"
        type={type}
        step={step}
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SettingLabel({
  label,
  tip,
  className,
}: {
  label: ReactNode;
  tip: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 cursor-help border-b border-dotted border-text-muted/50 text-[10px] mono uppercase tracking-widest text-text-muted",
            className
          )}
        >
          {label}
          <HelpCircle className="h-3 w-3 shrink-0 opacity-60" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs leading-relaxed">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function SettingTip({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs leading-relaxed">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}
