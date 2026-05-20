"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { AlertTriangle, Save, PlugZap, Zap, Pause, Ban, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizePairBlacklistEntries } from "@/lib/pairBlacklistCore";

const MODELS = {
  claude: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5","claude-sonnet-4-6"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
  ollama: ["llama3.2", "qwen3.5:397b-cloud", "qwen3.5"],
};

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

export default function SettingsPage() {
  const { data, mutate } = useSWR<any>("/api/settings");
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [confirmBinance, setConfirmBinance] = useState(false);
  const [blacklistDraft, setBlacklistDraft] = useState("");

  useEffect(() => {
    if (data && !form) {
      const next = {
        ...data,
        pairBlacklist: normalizePairBlacklistEntries(data.pairBlacklist),
      };
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
    if (
      (form.binanceApiKey && !form.binanceApiKey.includes("•")) ||
      (form.binanceApiSecret && !form.binanceApiSecret.includes("•"))
    ) {
      if (!confirmBinance) {
        setConfirmBinance(true);
        return;
      }
    }
    setSaving(true);
    try {
      const r = await fetch("/api/settings", { method: "POST", body: JSON.stringify(form) });
      const j = await r.json();
      toast.success("Settings saved");
      setForm(j);
      mutate(j);
      setConfirmBinance(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function testAi() {
    toast.loading("Testing AI provider…", { id: "test-ai" });
    const r = await fetch("/api/settings/test-ai", { method: "POST", body: JSON.stringify(form) });
    const j = await r.json();
    if (j.ok) toast.success(`AI OK · ${j.latencyMs}ms`, { id: "test-ai" });
    else toast.error(`AI failed: ${j.error}`, { id: "test-ai" });
  }

  async function testBinance() {
    toast.loading("Testing Binance…", { id: "test-bin" });
    const r = await fetch("/api/settings/test-binance", { method: "POST", body: JSON.stringify(form) });
    const j = await r.json();
    if (j.ok) {
      const b = j.balances?.find((x: any) => x.asset === "USDC");
      toast.success(`Binance OK · USDC: ${b?.free?.toFixed(2) ?? 0}`, { id: "test-bin" });
    } else {
      toast.error(`Binance failed: ${j.error}`, { id: "test-bin" });
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-end justify-between">
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

      {/* AI Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <button className="btn" onClick={testAi}>
            <PlugZap className="h-4 w-4" /> Test Connection
          </button>
        </CardHeader>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {(["claude", "gemini", "ollama"] as const).map((p) => (
            <button
              key={p}
              onClick={() => set({ aiProvider: p, aiModel: MODELS[p][0] || form.aiModel })}
              className={cn(
                "rounded-xl border p-4 text-left transition",
                form.aiProvider === p
                  ? "border-primary/50 bg-primary/10 shadow-neon"
                  : "border-border bg-surface-2/30 hover:border-primary/30"
              )}
            >
              <div className="font-heading text-sm tracking-wider uppercase">{p}</div>
              <div className="text-[11px] text-text-muted mt-1 mono">
                {p === "claude" ? "Anthropic Claude 4.5" : p === "gemini" ? "Google Gemini 2.0" : "Local (Ollama)"}
              </div>
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {form.aiProvider !== "ollama" && (
            <div>
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">
                {form.aiProvider === "claude" ? "Anthropic API Key" : "Google API Key"}
              </label>
              <input
                className="input mt-1"
                type="password"
                value={form.aiApiKey || ""}
                onChange={(e) => set({ aiApiKey: e.target.value })}
                placeholder="sk-ant-..."
              />
            </div>
          )}
          {form.aiProvider === "ollama" && (
            <div>
              <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Ollama URL</label>
              <input
                className="input mt-1"
                value={form.ollamaUrl || ""}
                onChange={(e) => set({ ollamaUrl: e.target.value })}
              />
            </div>
          )}

          <div>
            <label className="text-[10px] mono uppercase tracking-widest text-text-muted">Model</label>
            {form.aiProvider === "ollama" ? (
              <input
                className="input mt-1"
                value={form.aiModel || ""}
                onChange={(e) => set({ aiModel: e.target.value })}
                placeholder="llama3.2"
              />
            ) : (
              <select className="input mt-1" value={form.aiModel || ""} onChange={(e) => set({ aiModel: e.target.value })}>
                {MODELS[form.aiProvider as "claude" | "gemini"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </Card>

      {/* Trading Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Controls</CardTitle>
        </CardHeader>

        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2/30 p-4 mb-4">
          <div>
            <div className="font-heading text-base">AI Pilot</div>
            <div className="text-xs text-text-muted mono">Master switch · stops/starts all cron activity</div>
          </div>
          <BigToggle active={!!form.pilotActive} onChange={(v) => set({ pilotActive: v })} />
        </div>

        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <ToggleRow
            label="5-min Position Check Cron"
            active={!!form.positionCheckCronActive}
            onChange={(v) => set({ positionCheckCronActive: v })}
          />
          <ToggleRow
            label="15-min Analysis Cron"
            active={!!form.analysisCronActive}
            onChange={(v) => set({ analysisCronActive: v })}
          />
          <ToggleRow
            label="Dry Run Mode (no real orders)"
            active={!!form.dryRun}
            onChange={(v) => set({ dryRun: v })}
          />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Field
            label="Max Open Pairs"
            type="number"
            min={1}
            max={20}
            value={form.maxOpenPairs}
            onChange={(v) => set({ maxOpenPairs: +v })}
          />
          <Field
            label="Max USDC per Order"
            type="number"
            min={10}
            max={1000}
            value={form.maxUsdcPerOrder}
            onChange={(v) => set({ maxUsdcPerOrder: +v })}
          />
          <Field
            label="Stop Loss %"
            type="number"
            step={0.1}
            value={form.stopLossPercent}
            onChange={(v) => set({ stopLossPercent: +v })}
          />
          <Field
            label="Risk / Reward Ratio"
            type="number"
            step={0.1}
            value={form.riskRewardRatio}
            onChange={(v) => set({ riskRewardRatio: +v, takeProfitPercent: +(form.stopLossPercent * +v).toFixed(2) })}
          />
          <Field
            label="Take Profit %"
            type="number"
            step={0.1}
            value={form.takeProfitPercent}
            onChange={(v) => set({ takeProfitPercent: +v })}
          />
          <div>
            <label className="text-[10px] mono uppercase tracking-widest text-text-muted">
              Min AI Confidence · <span className="text-primary">{form.minConfidence}%</span>
            </label>
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
            <label className="text-[10px] mono uppercase tracking-widest text-text-muted">
              Min Technical Score · <span className="text-primary">{form.minTechnicalScore ?? 40}</span>
            </label>
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
            type="number"
            min={5}
            max={50}
            value={form.maxPump24hPct ?? 15}
            onChange={(v) => set({ maxPump24hPct: +v })}
          />
          <Field
            label="SL cooldown (minutes)"
            type="number"
            min={0}
            max={1440}
            value={form.slCooldownMinutes ?? 120}
            onChange={(v) => set({ slCooldownMinutes: +v })}
          />
          <Field
            label="TP reopen cooldown (min)"
            type="number"
            min={0}
            max={480}
            value={form.tpReopenCooldownMinutes ?? 30}
            onChange={(v) => set({ tpReopenCooldownMinutes: +v })}
          />
          <ToggleRow
            label="Entry gate (balanced TA filters)"
            active={form.entryGateEnabled ?? true}
            onChange={(v) => set({ entryGateEnabled: v })}
          />
          <p className="md:col-span-3 text-[11px] text-text-muted mono leading-relaxed -mt-1">
            Balanced: BUY/STRONG_BUY + score ≥ {form.minTechnicalScore ?? 40} (STRONG_BUY ≥{" "}
            {Math.max(30, (form.minTechnicalScore ?? 40) - 10)}), price ≥ EMA20, MACD 1h ≥ 0, RSI 15m 35–70, no 15m
            falling trend, skip 24h pump &gt; {form.maxPump24hPct ?? 15}%.
          </p>
          <div>
            <label className="text-[10px] mono uppercase tracking-widest text-text-muted">
              Display Timezone
            </label>
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

        <div className="rounded-xl border border-border/60 bg-surface-2/20 p-4 mt-6">
          <div className="flex items-center gap-2 mb-1">
            <Ban className="h-4 w-4 text-warning shrink-0" />
            <span className="text-sm font-heading tracking-wide">Pair blacklist</span>
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

      {/* Binance API */}
      <Card>
        <CardHeader>
          <CardTitle>Binance API</CardTitle>
          <button className="btn" onClick={testBinance}>
            <PlugZap className="h-4 w-4" /> Test Connection
          </button>
        </CardHeader>

        {confirmBinance && (
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 mb-4 text-xs text-warning">
            <strong>Confirm Save:</strong> You are about to persist new Binance credentials. Click <em>Confirm Save</em> again to proceed.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Field
            label="API Key"
            type="password"
            value={form.binanceApiKey || ""}
            onChange={(v) => set({ binanceApiKey: v })}
          />
          <Field
            label="API Secret"
            type="password"
            value={form.binanceApiSecret || ""}
            onChange={(v) => set({ binanceApiSecret: v })}
          />
        </div>

        <div className="mt-4">
          <ToggleRow
            label={form.binanceTestnet ? "Testnet (safe)" : "Live Trading (real money)"}
            active={!!form.binanceTestnet}
            onChange={(v) => set({ binanceTestnet: v })}
          />
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications · Telegram</CardTitle>
        </CardHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <Field
            label="Bot Token"
            type="password"
            value={form.telegramBotToken || ""}
            onChange={(v) => set({ telegramBotToken: v })}
          />
          <Field
            label="Chat ID"
            value={form.telegramChatId || ""}
            onChange={(v) => set({ telegramChatId: v })}
          />
        </div>
      </Card>
    </div>
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

function ToggleRow({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-2/30 p-3">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => onChange(!active)}
        className={cn(
          "relative h-6 w-12 rounded-full border transition",
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
  value,
  onChange,
  type = "text",
  step,
  min,
  max,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  type?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label className="text-[10px] mono uppercase tracking-widest text-text-muted">{label}</label>
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
