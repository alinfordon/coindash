"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Loader2, ShoppingCart, Wallet } from "lucide-react";

type Preflight = {
  freeUsdc: number | null;
  freeUsdcError?: string | null;
  minNotional?: number | null;
  alreadyOpen?: boolean;
  dryRun?: boolean;
  maxUsdcPerOrder?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  riskRewardRatio?: number;
  effectiveTakeProfitPercent?: number;
  maxOpenPairs?: number;
  openPositions?: number;
};

type AnalysisBuyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pair: string;
  price?: number;
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
  "w-full rounded-lg border border-border/70 bg-surface-2/50 px-3 py-2 text-sm mono text-text-primary focus:outline-none focus:border-primary/50";

export function AnalysisBuyModal({
  open,
  onOpenChange,
  pair,
  price,
  confidence,
  reasoning,
  indicators,
  onSuccess,
}: AnalysisBuyModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [usdc, setUsdc] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  useEffect(() => {
    if (!open || !pair) return;
    let cancelled = false;
    setLoading(true);
    setPreflight(null);

    fetch(`/api/trades/buy?pair=${encodeURIComponent(pair)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok && j.error) throw new Error(j.error);
        setPreflight(j);
        setUsdc(String(j.maxUsdcPerOrder ?? 50));
        setStopLoss(String(j.stopLossPercent ?? 2));
        setTakeProfit(String(j.takeProfitPercent ?? 4));
      })
      .catch((e: Error) => {
        if (!cancelled) toast.error(e.message || "Could not load order data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, pair]);

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
    Number.isFinite(slNum) &&
    slNum > 0 &&
    Number.isFinite(tpNum) &&
    tpNum > 0;

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
          stopLossPercent: slNum,
          takeProfitPercent: tpNum,
          entryHint: refPrice ?? undefined,
          aiConfidence: confidence ?? 0,
          aiReasoning: reasoning ? `Manual: ${reasoning}` : "Manual buy from Analysis",
          indicators,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Order failed");
      toast.success(
        preflight?.dryRun
          ? `[Dry run] ${pair} · $${usdcNum} · SL/TP set`
          : `${pair} opened · $${usdcNum} USDC`
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-success" />
            Cumpără {pair}
          </DialogTitle>
          <DialogDescription>
            Ordin MARKET cu OCO (Stop Loss + Take Profit).{" "}
            {preflight?.dryRun && (
              <span className="text-warning">Mod dry run — fără ordine reale.</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-surface-2/30 p-3 flex items-start gap-3">
              <Wallet className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm space-y-0.5">
                <div className="text-text-muted text-[10px] mono uppercase">Capital USDC disponibil</div>
                <div className="mono text-lg text-text-primary">
                  {preflight?.dryRun
                    ? "∞ (dry run)"
                    : preflight?.freeUsdc != null
                      ? fmtUsd(preflight.freeUsdc)
                      : "—"}
                </div>
                {preflight?.freeUsdcError && (
                  <div className="text-[10px] text-warning">{preflight.freeUsdcError}</div>
                )}
                {refPrice != null && (
                  <div className="text-[10px] mono text-text-muted">Preț ref. scan: {fmtUsd(refPrice, 4)}</div>
                )}
              </div>
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

            <Field
              label="Sumă ordin (USDC)"
              hint={
                preflight?.minNotional
                  ? `Min. notional Binance: $${preflight.minNotional}`
                  : "Implicit din setări; poți modifica."
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Stop Loss (%)" hint="Sub preț intrare">
                <input
                  type="number"
                  min={0.1}
                  max={50}
                  step={0.1}
                  className={inputClass}
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
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
                />
              </Field>
            </div>

            {tpEffective != null && refPrice != null && previewSl != null && previewTp != null && (
              <div className="text-[10px] mono text-text-muted rounded-lg border border-border/50 px-3 py-2 space-y-0.5">
                <div>SL @ {fmtUsd(previewSl, 4)} · TP @ {fmtUsd(previewTp, 4)}</div>
                <div>TP folosit: {tpEffective.toFixed(2)}%</div>
              </div>
            )}
          </div>
        )}

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
