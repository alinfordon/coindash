"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn, fmtNum, fmtUsd } from "@/lib/utils";
import {
  type ExchangeId,
  EXCHANGE_IDS,
  exchangeLabel,
  isExchangeConnected,
} from "@/lib/exchanges";
import { Link2Off, Loader2, PlugZap, TrendingUp, Unplug } from "lucide-react";

type KrakenXStockRow = {
  symbol: string;
  wsName: string;
  lastPrice: number;
  change24hPct: number;
  quoteVolume: number;
};

type KrakenXStocksProbe = {
  catalogTotal: number;
  eligible: boolean | null;
  eligibilityMessage: string;
  probedPair: string | null;
  samplePairs: KrakenXStockRow[];
};

type ExchangeForm = {
  activeExchange?: ExchangeId;
  binanceApiKey?: string;
  binanceApiSecret?: string;
  binanceTestnet?: boolean;
  krakenApiKey?: string;
  krakenApiSecret?: string;
  krakenMarkets?: "crypto" | "stocks" | "both";
};

function hasSavedCredentials(key?: string, secret?: string): boolean {
  if (!key?.trim() || !secret?.trim()) return false;
  if (key.includes("•") && secret.includes("•")) return true;
  return !key.includes("•") && !secret.includes("•");
}

function exchangeConnected(form: ExchangeForm, id: ExchangeId): boolean {
  if (id === "binance") {
    return hasSavedCredentials(form.binanceApiKey, form.binanceApiSecret);
  }
  return hasSavedCredentials(form.krakenApiKey, form.krakenApiSecret);
}

export function ExchangeConnectionsCard({
  form,
  set,
  confirmExchangeSave,
  onConfirmExchangeSave,
  onSaved,
}: {
  form: ExchangeForm;
  set: (patch: Partial<ExchangeForm>) => void;
  confirmExchangeSave: boolean;
  onConfirmExchangeSave: (v: boolean) => void;
  onSaved: (settings: ExchangeForm) => void;
}) {
  const active = form.activeExchange === "kraken" ? "kraken" : "binance";
  const [xStocksProbe, setXStocksProbe] = useState<KrakenXStocksProbe | null>(null);
  const [xStocksLoading, setXStocksLoading] = useState(false);

  async function testKrakenXStocks() {
    setXStocksLoading(true);
    toast.loading("Verific xStocks Kraken…", { id: "xstocks-probe" });
    try {
      const r = await fetch("/api/settings/test-kraken-xstocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Probe failed");
      setXStocksProbe(j as KrakenXStocksProbe);
      const elig =
        j.eligible === true ? "eligibil" : j.eligible === false ? "neeligibil" : "catalog public";
      toast.success(`xStocks: ${j.catalogTotal} perechi · cont ${elig}`, { id: "xstocks-probe" });
    } catch (e: any) {
      toast.error(e.message || "xStocks probe failed", { id: "xstocks-probe" });
    } finally {
      setXStocksLoading(false);
    }
  }

  async function testExchange(id: ExchangeId) {
    const label = exchangeLabel(id);
    toast.loading(`Test ${label}…`, { id: "test-ex" });
    const url = id === "kraken" ? "/api/settings/test-kraken" : "/api/settings/test-binance";
    const r = await fetch(url, { method: "POST", body: JSON.stringify(form) });
    const j = await r.json();
    if (j.ok) {
      const usdc =
        id === "kraken"
          ? j.usdcFree?.toFixed?.(2) ?? "0.00"
          : j.balances?.find((x: { asset: string }) => x.asset === "USDC")?.free?.toFixed?.(2) ?? "0.00";
      toast.success(`${label} OK · USDC: ${usdc}`, { id: "test-ex" });
    } else {
      toast.error(`${label} failed: ${j.error}`, { id: "test-ex" });
    }
  }

  async function disconnect(id: ExchangeId) {
    const label = exchangeLabel(id);
    if (!window.confirm(`Deconectezi ${label}? Cheile API vor fi șterse din cont.`)) return;
    toast.loading(`Deconectare ${label}…`, { id: "disc-ex" });
    try {
      const r = await fetch("/api/settings/disconnect-exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchange: id }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Disconnect failed");
      onSaved(j.settings);
      toast.success(`${label} deconectat`, { id: "disc-ex" });
    } catch (e: any) {
      toast.error(e.message || "Disconnect failed", { id: "disc-ex" });
    }
  }

  function selectActive(id: ExchangeId) {
    if (!exchangeConnected(form, id)) {
      toast.error(`Conectează ${exchangeLabel(id)} înainte de a-l activa.`);
      return;
    }
    set({ activeExchange: id });
  }

  const pendingNewSecrets = EXCHANGE_IDS.some((id) => {
    if (id === "binance") {
      return (
        (form.binanceApiKey && !form.binanceApiKey.includes("•")) ||
        (form.binanceApiSecret && !form.binanceApiSecret.includes("•"))
      );
    }
    return (
      (form.krakenApiKey && !form.krakenApiKey.includes("•")) ||
      (form.krakenApiSecret && !form.krakenApiSecret.includes("•"))
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="normal-case tracking-normal text-text-primary">Exchange · Spot</CardTitle>
        <p className="text-[10px] mono text-text-muted mt-1">Un singur exchange activ · poți salva ambele conexiuni</p>
      </CardHeader>

      {confirmExchangeSave && pendingNewSecrets && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 mb-4 text-xs text-warning">
          <strong>Confirm Save:</strong> salvezi credențiale exchange noi. Apasă din nou{" "}
          <em>Confirm Save</em> sau{" "}
          <button type="button" className="underline" onClick={() => onConfirmExchangeSave(false)}>
            anulează
          </button>
          .
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {EXCHANGE_IDS.map((id) => {
          const connected = exchangeConnected(form, id);
          const isActive = active === id;
          return (
            <div
              key={id}
              className={cn(
                "rounded-xl border p-4 space-y-4 transition",
                isActive ? "border-primary/40 bg-primary/5 shadow-neon" : "border-border/70 bg-surface-2/20"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-heading text-sm tracking-wider uppercase">{exchangeLabel(id)}</div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span
                      className={cn(
                        "text-[10px] mono uppercase tracking-widest px-2 py-0.5 rounded-full border",
                        connected
                          ? "border-success/40 text-success bg-success/10"
                          : "border-border text-text-muted"
                      )}
                    >
                      {connected ? "Conectat" : "Neconectat"}
                    </span>
                    {isActive && (
                      <span className="text-[10px] mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-primary/40 text-primary bg-primary/10">
                        Activ
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={cn(
                    "text-[10px] mono uppercase tracking-widest px-2.5 py-1 rounded-lg border transition shrink-0",
                    isActive
                      ? "border-primary/50 text-primary cursor-default"
                      : connected
                        ? "border-border hover:border-primary/40 text-text-muted hover:text-primary"
                        : "border-border/50 text-text-muted/40 cursor-not-allowed"
                  )}
                  disabled={isActive || !connected}
                  onClick={() => selectActive(id)}
                >
                  {isActive ? "Activ" : "Setează activ"}
                </button>
              </div>

              {id === "binance" ? (
                <>
                  <div className="grid sm:grid-cols-1 gap-3">
                    <ExchangeField
                      label="API Key"
                      type="password"
                      value={form.binanceApiKey || ""}
                      onChange={(v) => set({ binanceApiKey: v })}
                    />
                    <ExchangeField
                      label="API Secret"
                      type="password"
                      value={form.binanceApiSecret || ""}
                      onChange={(v) => set({ binanceApiSecret: v })}
                    />
                  </div>
                  <ToggleRowMini
                    label={form.binanceTestnet ? "Testnet (safe)" : "Live Trading (real money)"}
                    active={!!form.binanceTestnet}
                    onChange={(v) => set({ binanceTestnet: v })}
                  />
                </>
              ) : (
                <div className="grid sm:grid-cols-1 gap-3">
                  <ExchangeField
                    label="API Key"
                    type="password"
                    value={form.krakenApiKey || ""}
                    onChange={(v) => set({ krakenApiKey: v })}
                  />
                  <ExchangeField
                    label="API Secret (base64)"
                    type="password"
                    value={form.krakenApiSecret || ""}
                    onChange={(v) => set({ krakenApiSecret: v })}
                  />
                  <p className="text-[10px] text-text-muted leading-relaxed">
                    Secretul Kraken este afișat base64 în contul tău Kraken. Permisiuni: Query + Trade (Spot).
                  </p>
                  <div>
                    <span className="text-[10px] mono uppercase tracking-widest text-text-muted">
                      Piețe Kraken
                    </span>
                    <select
                      className="input mt-1"
                      value={form.krakenMarkets || "both"}
                      onChange={(e) =>
                        set({
                          krakenMarkets: e.target.value as "crypto" | "stocks" | "both",
                        })
                      }
                    >
                      <option value="both">Crypto + xStocks (acțiuni tokenizate)</option>
                      <option value="crypto">Doar crypto spot</option>
                      <option value="stocks">Doar xStocks (acțiuni)</option>
                    </select>
                    <p className="text-[10px] text-text-muted mt-1 leading-relaxed">
                      xStocks (ex. AAPLxUSD) necesită cont eligibil Kraken și parametrul{" "}
                      <code className="mono">asset_class=tokenized_asset</code>.
                    </p>
                  </div>
                  <KrakenXStocksProbePanel
                    probe={xStocksProbe}
                    loading={xStocksLoading}
                    onProbe={testKrakenXStocks}
                    connected={connected}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn text-xs" onClick={() => testExchange(id)}>
                  <PlugZap className="h-3.5 w-3.5" /> Test
                </button>
                {id === "kraken" && (
                  <button
                    type="button"
                    className="btn text-xs border-primary/40 text-primary"
                    disabled={xStocksLoading}
                    onClick={testKrakenXStocks}
                  >
                    {xStocksLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}{" "}
                    Verifică xStocks
                  </button>
                )}
                {connected && (
                  <button type="button" className="btn text-xs border-danger/40 text-danger" onClick={() => disconnect(id)}>
                    <Link2Off className="h-3.5 w-3.5" /> Deconectează
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isExchangeConnected(form as any, active) && (
        <p className="text-xs text-warning mt-4 flex items-center gap-2">
          <Unplug className="h-3.5 w-3.5 shrink-0" />
          Exchange-ul activ ({exchangeLabel(active)}) nu are credențiale valide — conectează și salvează.
        </p>
      )}
    </Card>
  );
}

function KrakenXStocksProbePanel({
  probe,
  loading,
  onProbe,
  connected,
}: {
  probe: KrakenXStocksProbe | null;
  loading: boolean;
  onProbe: () => void;
  connected: boolean;
}) {
  if (!probe && !loading) {
    return (
      <div className="rounded-lg border border-border/50 bg-surface-2/20 p-3 text-[10px] text-text-muted leading-relaxed">
        Apasă <strong className="text-text-primary">Verifică xStocks</strong> pentru lista perechilor
        tokenizate și test eligibilitate cont
        {connected ? "" : " (salvează cheile Kraken mai întâi)"}.
        <button type="button" className="block mt-2 text-primary hover:underline mono" onClick={onProbe}>
          Rulează acum →
        </button>
      </div>
    );
  }

  if (loading && !probe) {
    return (
      <div className="rounded-lg border border-border/50 bg-surface-2/20 p-3 flex items-center gap-2 text-[10px] mono text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Se încarcă catalog xStocks…
      </div>
    );
  }

  if (!probe) return null;

  const eligLabel =
    probe.eligible === true
      ? { text: "Eligibil", className: "border-success/40 text-success bg-success/10" }
      : probe.eligible === false
        ? { text: "Neeligibil", className: "border-danger/40 text-danger bg-danger/10" }
        : { text: "Neverificat", className: "border-warning/40 text-warning bg-warning/10" };

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] mono uppercase tracking-widest text-primary">xStocks Kraken</span>
        <span className="chip border-border text-text-muted text-[10px]">{probe.catalogTotal} perechi</span>
        <span className={cn("text-[10px] mono uppercase tracking-widest px-2 py-0.5 rounded-full border", eligLabel.className)}>
          {eligLabel.text}
        </span>
        {probe.probedPair && (
          <span className="text-[10px] mono text-text-muted">test: {probe.probedPair}</span>
        )}
      </div>
      <p className="text-[10px] text-text-muted leading-relaxed">{probe.eligibilityMessage}</p>
      {probe.samplePairs.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[10px] mono min-w-[280px]">
            <thead>
              <tr className="text-text-muted border-b border-border/40">
                <th className="text-left py-1 px-1 font-normal">Pereche</th>
                <th className="text-right py-1 px-1 font-normal">Preț</th>
                <th className="text-right py-1 px-1 font-normal">24h</th>
              </tr>
            </thead>
            <tbody>
              {probe.samplePairs.map((p) => (
                <tr key={p.symbol} className="border-b border-border/20 last:border-0">
                  <td className="py-1 px-1 text-text-primary">{p.symbol}</td>
                  <td className="py-1 px-1 text-right">{fmtUsd(p.lastPrice, 2)}</td>
                  <td
                    className={cn(
                      "py-1 px-1 text-right",
                      p.change24hPct >= 0 ? "text-success" : "text-danger"
                    )}
                  >
                    {p.change24hPct >= 0 ? "+" : ""}
                    {fmtNum(p.change24hPct, 2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" className="text-[10px] mono text-primary hover:underline" onClick={onProbe} disabled={loading}>
        {loading ? "Se reîmprospătează…" : "Reverifică"}
      </button>
    </div>
  );
}

function ExchangeField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <span className="text-[10px] mono uppercase tracking-widest text-text-muted">{label}</span>
      <input className="input mt-1" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ToggleRowMini({
  label,
  active,
  onChange,
}: {
  label: string;
  active: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-2/30 p-3">
      <span className="text-xs">{label}</span>
      <button
        type="button"
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
