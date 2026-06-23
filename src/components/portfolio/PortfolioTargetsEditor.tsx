"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Plus, Save, Trash2 } from "lucide-react";
import type { InvestTarget } from "@/lib/investPortfolioTypes";
import { DEFAULT_TARGETS } from "@/lib/investPortfolioTypes";

type Props = {
  targets: InvestTarget[];
  threshold: number;
  onSaved: () => void;
};

export function PortfolioTargetsEditor({ targets, threshold, onSaved }: Props) {
  const [rows, setRows] = useState<InvestTarget[]>(targets);
  const [thresh, setThresh] = useState(threshold);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(targets);
    setThresh(threshold);
  }, [targets, threshold]);

  const sum = useMemo(() => rows.reduce((a, r) => a + (r.weightPct || 0), 0), [rows]);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/portfolio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: rows, rebalanceThresholdPct: thresh }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success("Ținte salvate — alocarea va fi normalizată la 100%");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Eroare");
    } finally {
      setSaving(false);
    }
  }

  function addRow() {
    setRows((prev) => [...prev, { asset: "", weightPct: 0 }]);
  }

  function resetDefaults() {
    setRows([...DEFAULT_TARGETS]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ținte alocare long-term</CardTitle>
      </CardHeader>
      <div className="space-y-4">
        <p className="text-xs text-text-muted leading-relaxed">
          Definește ponderea țintă per activ (BTC, ETH, USDC etc.). La salvare, procentele se normalizează la 100%.
          Rebalansarea se sugerează când drift-ul depășește pragul configurat.
        </p>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className="input flex-1 mono uppercase"
                placeholder="BTC"
                value={row.asset}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setRows((prev) => prev.map((r, j) => (j === i ? { ...r, asset: v } : r)));
                }}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="input w-24 mono"
                value={row.weightPct || ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setRows((prev) => prev.map((r, j) => (j === i ? { ...r, weightPct: v } : r)));
                }}
              />
              <span className="text-xs text-text-muted w-4">%</span>
              <button
                type="button"
                className="btn-ghost px-2"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn text-xs" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Activ
          </button>
          <button type="button" className="btn text-xs" onClick={resetDefaults}>
            Reset default
          </button>
        </div>

        <div>
          <label className="text-[10px] mono uppercase tracking-widest text-text-muted">
            Prag rebalansare (drift %)
          </label>
          <input
            type="range"
            min={1}
            max={25}
            step={1}
            className="w-full mt-2"
            value={thresh}
            onChange={(e) => setThresh(+e.target.value)}
          />
          <div className="flex justify-between text-xs text-text-muted mt-1">
            <span>1%</span>
            <span className="text-text-primary mono">{thresh}%</span>
            <span>25%</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">
            Sumă curentă: <span className="mono text-text-primary">{sum.toFixed(1)}%</span>
            {Math.abs(sum - 100) > 0.5 && (
              <span className="text-warning ml-2">→ normalizat la 100% la salvare</span>
            )}
          </span>
          <button type="button" className="btn-primary" disabled={saving || rows.length === 0} onClick={save}>
            <Save className="h-4 w-4" />
            Salvează ținte
          </button>
        </div>
      </div>
    </Card>
  );
}
