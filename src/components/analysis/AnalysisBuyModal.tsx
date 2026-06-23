"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtUsd } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { OrderPreviewChart } from "@/components/trading/OrderPreviewChart";
import { Loader2, ShoppingCart, Wallet } from "lucide-react";

type Preflight = {
  freeUsdc: number | null;
  freeUsdcError?: string | null;
  minNotional?: number | null;
  alreadyOpen?: boolean;
  dryRun?: boolean;
  testnet?: boolean;
  maxUsdcPerOrder?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  riskRewardRatio?: number;
  effectiveTakeProfitPercent?: number;
  maxOpenPairs?: number;
  openPositions?: number;
};

type ManualTradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pair: string;
  price?: number;
  /** Where the manual order was opened from (for trade log). */
  source?: string;
  confidence?: number;
  reasoning?: string;
  indicators?: Record<string, unknown>;
  onSuccess?: () => void;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] mono uppercase tracking-widest text-text-muted">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-text-muted">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-border/70 bg-surface-2/50 px-3 py-2 text-sm mono text-text-primary focus:outline-none focus:border-primary/50 disabled:opacity-45 disabled:cursor-not-allowed";

export function ManualTradeModal({
  open,
  onOpenChange,
  pair,
  price,
  source = "manual",
  confidence,
  reasoning,
  indicators,
  onSuccess,
}: ManualTradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [usdc, setUsdc] = useState("");
  const [withSlTp, setWithSlTp] = useState(true);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  useLayoutEffect(() => {
    if (!open) {
      setPreflight(null);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !pair) return;
    let cancelled = false;
    setLoading(true);
    setPreflight(null);

    fetch(`/api/trades/buy?pair=${encodeURIComponent(pair)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok && j.error) throw new Error(j.error);
        setPreflight({
          ...j,
          dryRun: j.dryRun === true,
          testnet: j.testnet === true,
        });
        setUsdc(String(j.maxUsdcPerOrder ?? 50));
        setWithSlTp(true);
        setStopLoss(String(j.stopLossPercent ?? 2));
        setTakeProfit(String(j.takeProfitPercent ?? 4));
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setPreflight(null);
          toast.error(e.message || "Could not load order data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, pair]);

  const isDryRun = preflight?.dryRun === true;
  const isTestnet = preflight?.testnet === true;
  const preflightReady = !loading && preflight != null;

  const usdcNum = parseFloat(usdc);
  const slNum = parseFloat(stopLoss);
  const tpNum = parseFloat(takeProfit);
  const rr = preflight?.riskRewardRatio ?? 2;
  const tpEffective = useMemo(() => {
    if (!Number.isFinite(slNum) || !Number.isFinite(tpNum)) return null;
    return Math.max(tpNum, slNum * rr);
  }, [slNum, tpNum, rr]);

  const refPrice = price && price > 0 ? price : null;
  const previewSl = refPrice && Number.isFinite(slNum) ? refPrice * (1 - slNum / 100) : null;
  const previewTp = refPrice && tpEffective != null ? refPrice * (1 + tpEffective / 100) : null;

  const canSubmit =
    !loading &&
    !submitting &&
    !preflight?.alreadyOpen &&
    Number.isFinite(usdcNum) &&
    usdcNum >= 10 &&
    (!withSlTp ||
      (Number.isFinite(slNum) && slNum > 0 && Number.isFinite(tpNum) && tpNum > 0));

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/trades/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair,
          usdcValue: usdcNum,
          withSlTp,
          stopLossPercent: withSlTp ? slNum : undefined,
          takeProfitPercent: withSlTp ? tpNum : undefined,
          entryHint: refPrice ?? undefined,
          aiConfidence: confidence ?? 0,
          aiReasoning: reasoning ? `Manual: ${reasoning}` : `Manual buy from ${source}`,
          indicators,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Order failed");
      toast.success(
        isDryRun
          ? withSlTp
            ? `[Dry run] ${pair} · $${usdcNum} · SL/TP set`
            : `[Dry run] ${pair} · $${usdcNum} · fără SL/TP`
          : withSlTp
            ? `${pair} opened · $${usdcNum} USDC · SL/TP`
            : `${pair} opened · $${usdcNum} USDC · fără SL/TP`
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast.error(e.message || "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-success" />
            Cumpără {pair}
          </DialogTitle>
          <DialogDescription>
            Trading manual — ordin MARKET
            {withSlTp ? " + OCO (SL/TP)" : ", fără SL/TP"}.
            {loading && <span className="text-text-muted"> Se încarcă setările…</span>}
            {preflightReady && (
              <>
                {" "}
                {isDryRun ? (
                  <span className="text-warning">Mod dry run — fără ordine reale.</span>
                ) : isTestnet ? (
                  <span className="text-primary">Ordine reale pe Binance TESTNET.</span>
                ) : (
                  <span className="text-success">Ordine reale pe Binance LIVE.</span>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {pair && (
            <OrderPreviewChart
              symbol={pair}
              testnet={preflight?.testnet ?? false}
              entryPrice={refPrice}
              stopLoss={previewSl}
              takeProfit={previewTp}
              withSlTp={withSlTp}
            />
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/60 bg-surface-2/30 p-3 flex items-start gap-3 min-h-[88px]">
                  <Wallet className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="text-sm space-y-0.5 min-w-0">
                    <div className="text-text-muted text-[10px] mono uppercase">Capital USDC</div>
                    <div className="mono text-lg text-text-primary">
                      {loading
                        ? "…"
                        : isDryRun
                          ? "∞ (dry run)"
                          : preflight?.freeUsdc != null
                            ? fmtUsd(preflight.freeUsdc)
                            : "—"}
                    </div>
                    {preflight?.freeUsdcError && (
                      <div className="text-[10px] text-warning">{preflight.freeUsdcError}</div>
                    )}
                    {refPrice != null && (
                      <div className="text-[10px] mono text-text-muted">Preț: {fmtUsd(refPrice, 4)}</div>
                    )}
                  </div>
                </div>

                <Field
                  label="Sumă ordin (USDC)"
                  hint={
                    preflight?.minNotional
                      ? `Min. notional: $${preflight.minNotional}`
                      : "Din setări; editabil."
                  }
                >
                  <input
                    type="number"
                    min={10}
                    step={1}
                    className={inputClass}
                    value={usdc}
                    onChange={(e) => setUsdc(e.target.value)}
                  />
                </Field>
              </div>

              {preflight?.alreadyOpen && (
                <div className="text-xs text-warning border border-warning/30 rounded-lg px-3 py-2">
                  Ai deja o poziție deschisă pe {pair}.
                </div>
              )}

              {preflight?.openPositions != null &&
                preflight.maxOpenPairs != null &&
                preflight.openPositions >= preflight.maxOpenPairs && (
                  <div className="text-xs text-warning border border-warning/30 rounded-lg px-3 py-2">
                    Limită poziții atinsă ({preflight.openPositions}/{preflight.maxOpenPairs}).
                  </div>
                )}

              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.1fr)_1fr_1fr] gap-3 items-end">
                <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-2/30 px-3 py-2.5 cursor-pointer select-none sm:min-h-[66px]">
                  <div className="min-w-0">
                    <div className="text-[10px] mono uppercase tracking-widest text-text-muted">SL/TP (OCO)</div>
                    <div className="text-[10px] text-text-muted mt-1 leading-snug">
                      {withSlTp ? "MARKET + OCO" : "Doar MARKET"}
                    </div>
                  </div>
                  <Switch checked={withSlTp} onCheckedChange={setWithSlTp} className="shrink-0" />
                </label>

                <Field label="Stop Loss (%)" hint="Sub intrare">
                  <input
                    type="number"
                    min={0.1}
                    max={50}
                    step={0.1}
                    className={inputClass}
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    disabled={!withSlTp}
                  />
                </Field>

                <Field label="Take Profit (%)" hint={`Efectiv: max(TP, SL×${rr})`}>
                  <input
                    type="number"
                    min={0.1}
                    max={100}
                    step={0.1}
                    className={inputClass}
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    disabled={!withSlTp}
                  />
                </Field>
              </div>

              {withSlTp &&
                tpEffective != null &&
                refPrice != null &&
                previewSl != null &&
                previewTp != null && (
                  <div className="text-[10px] mono text-text-muted rounded-lg border border-border/50 px-3 py-2 space-y-0.5">
                    <div>
                      SL @ {fmtUsd(previewSl, 4)} · TP @ {fmtUsd(previewTp, 4)}
                    </div>
                    <div>TP folosit: {tpEffective.toFixed(2)}%</div>
                  </div>
                )}
            </div>
          )}
        </div>

        <DialogFooter>
          <button type="button" className="btn" onClick={() => onOpenChange(false)} disabled={submitting}>
            Anulează
          </button>
          <button type="button" className="btn-primary" disabled={!canSubmit} onClick={submit}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Se trimite…
              </>
            ) : (
              <>Trimite ordin</>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** @deprecated Use ManualTradeModal */
export const AnalysisBuyModal = ManualTradeModal;
