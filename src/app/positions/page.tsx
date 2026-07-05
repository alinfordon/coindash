"use client";

import useSWR from "swr";
import { Fragment, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { classOfPnl, fmtDuration, fmtNum, fmtPct, fmtUsd } from "@/lib/utils";
import { ChevronDown, ChevronRight, X, Check } from "lucide-react";
import { toast } from "sonner";
import { PositionChart } from "@/components/positions/PositionChart";
import { SWR_SETTINGS } from "@/lib/swrDefaults";

function formatEntryFee(fee: number | null | undefined, currency: string | null | undefined): string {
  if (fee == null || !Number.isFinite(fee) || fee <= 0) return "—";
  const cur = currency || "USD";
  if (cur === "USD" || cur === "USDC" || cur === "USDT") return `$${fee.toFixed(4)}`;
  return `${fee.toFixed(4)} ${cur}`;
}

export default function PositionsPage() {
  const { data, mutate } = useSWR<{ trades: any[] }>("/api/trades/open");
  const { data: settingsData } = useSWR<{ binanceTestnet?: boolean }>("/api/settings", undefined, SWR_SETTINGS);
  const trades = data?.trades || [];
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<"pair" | "pnl" | "duration">("pnl");
  const [filter, setFilter] = useState("");

  const filtered = trades
    .filter((t) => t.pair.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => {
      if (sort === "pair") return a.pair.localeCompare(b.pair);
      if (sort === "duration") return b.durationMs - a.durationMs;
      return b.pnlPercent - a.pnlPercent;
    });

  const toggleSel = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  async function closeIds(ids: string[]) {
    if (!ids.length) return;
    toast.loading(`Closing ${ids.length} position(s)…`, { id: "bulk" });
    await Promise.all(ids.map((id) => fetch(`/api/trades/close/${id}`, { method: "POST" })));
    toast.success("Done", { id: "bulk" });
    setSelected(new Set());
    mutate();
  }

  return (
    <div className="space-y-6">
      {/* Header + filters (stack on mobile) */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold">Open Positions</h1>
          <p className="text-sm text-text-muted mt-1 mono">{trades.length} ACTIVE</p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <input
            className="input col-span-2 md:w-56"
            placeholder="Filter pair…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select className="input md:w-36" value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="pnl">Sort: P&L</option>
            <option value="pair">Sort: Pair</option>
            <option value="duration">Sort: Duration</option>
          </select>
          <button
            className="btn-danger justify-center"
            onClick={() => closeIds(trades.map((t) => t._id))}
            disabled={!trades.length}
          >
            <X className="h-4 w-4" /> Close All
          </button>
          <button
            className="btn-primary col-span-2 md:col-span-1 justify-center"
            onClick={() => closeIds(Array.from(selected))}
            disabled={!selected.size}
          >
            <Check className="h-4 w-4" /> Close Selected ({selected.size})
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <Card>
          <div className="text-text-muted text-sm text-center py-8">
            No open positions match the filter. Enable AI Pilot or wait for next analysis cycle.
          </div>
        </Card>
      )}

      {/* ===== Mobile card layout ===== */}
      <div className="md:hidden space-y-3">
        {filtered.map((t) => {
          const isOpen = open[t._id];
          const sel = selected.has(t._id);
          return (
            <Card key={t._id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <label className="flex items-start gap-2 min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => toggleSel(t._id)}
                    className="mt-1 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono font-semibold text-base text-text-primary">{t.pair}</span>
                      {t.dryRun && <span className="chip border-warning/40 text-warning">DRY</span>}
                      <span className="chip border-primary/40 text-primary">
                        <span className="pulse-dot" /> {t.status}
                      </span>
                    </div>
                    <div className="text-[10px] mono text-text-muted mt-1">
                      {fmtDuration(t.durationMs)} · qty {fmtNum(t.quantity, 6)}
                      {t.entryFee != null && t.entryFee > 0 && (
                        <> · fee {formatEntryFee(t.entryFee, t.feeCurrency)}</>
                      )}
                    </div>
                  </div>
                </label>
                <div className="text-right shrink-0">
                  <div className={`mono font-semibold ${classOfPnl(t.pnlPercent)}`}>{fmtPct(t.pnlPercent)}</div>
                  <div className={`mono text-xs ${classOfPnl(t.pnlUsdc)}`}>{fmtUsd(t.pnlUsdc)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2">
                  <div className="text-[10px] mono uppercase tracking-widest text-text-muted">Entry</div>
                  <div className="mono">{fmtNum(t.entryPrice, 4)}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2">
                  <div className="text-[10px] mono uppercase tracking-widest text-text-muted">Current</div>
                  <div className="mono">{fmtNum(t.currentPrice, 4)}</div>
                </div>
                <div className="rounded-lg border border-danger/30 bg-surface-2/40 p-2">
                  <div className="text-[10px] mono uppercase tracking-widest text-text-muted">Stop Loss</div>
                  <div className="mono text-danger">{fmtNum(t.stopLoss, 4)}</div>
                </div>
                <div className="rounded-lg border border-success/30 bg-surface-2/40 p-2">
                  <div className="text-[10px] mono uppercase tracking-widest text-text-muted">Take Profit</div>
                  <div className="mono text-success">{fmtNum(t.takeProfit, 4)}</div>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  className="btn flex-1 justify-center py-1.5 text-xs"
                  onClick={() => setOpen({ ...open, [t._id]: !isOpen })}
                >
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {isOpen ? "Hide details" : "Show details"}
                </button>
                <button
                  className="btn-danger justify-center py-1.5 text-xs"
                  onClick={() => closeIds([t._id])}
                >
                  <X className="h-3 w-3" /> Close
                </button>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-3 border-t border-border/50 pt-3 animate-fadeUp">
                  <PositionChart
                    symbol={t.pair}
                    exchange={t.exchange === "kraken" ? "kraken" : "binance"}
                    assetClass={t.assetClass === "tokenized_asset" ? "tokenized_asset" : "crypto"}
                    testnet={settingsData?.binanceTestnet === true}
                    entryPrice={t.entryPrice}
                    stopLoss={t.stopLoss}
                    takeProfit={t.takeProfit}
                    quantity={t.quantity}
                    entryFee={t.entryFee}
                    feeCurrency={t.feeCurrency}
                  />
                  <div className="rounded-lg border border-border/50 bg-surface-2/30 p-3 text-xs">
                    <div className="text-[10px] mono uppercase tracking-widest text-text-muted mb-1">
                      AI Entry Reasoning
                    </div>
                    <div className="text-text-primary">{t.aiReasoning || "—"}</div>
                    <div className="mt-1 text-text-muted text-[10px]">
                      {t.aiProvider} · {t.aiModel} · conf {t.aiConfidence ?? "—"}%
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ===== Desktop table layout ===== */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Position Details</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-text-muted border-b border-border/70">
              <tr>
                <th className="w-8"></th>
                <th className="text-left py-2 px-2">Pair</th>
                <th className="text-right py-2 px-2">Entry</th>
                <th className="text-right py-2 px-2">Current</th>
                <th className="text-right py-2 px-2">P&L %</th>
                <th className="text-right py-2 px-2">P&L USDC</th>
                <th className="text-right py-2 px-2">Fee</th>
                <th className="text-right py-2 px-2">Duration</th>
                <th className="text-right py-2 px-2">Qty</th>
                <th className="text-right py-2 px-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const isOpen = open[t._id];
                return (
                  <Fragment key={t._id}>
                    <tr
                      className="border-b border-border/30 hover:bg-surface-2/30 cursor-pointer"
                      onClick={() => setOpen({ ...open, [t._id]: !isOpen })}
                    >
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={selected.has(t._id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSel(t._id)}
                          className="accent-primary"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <span className="flex items-center gap-2 mono font-semibold">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {t.pair}
                        </span>
                      </td>
                      <td className="text-right mono py-2 px-2">{fmtNum(t.entryPrice, 4)}</td>
                      <td className="text-right mono py-2 px-2">{fmtNum(t.currentPrice, 4)}</td>
                      <td className={`text-right mono py-2 px-2 ${classOfPnl(t.pnlPercent)}`}>
                        {fmtPct(t.pnlPercent)}
                      </td>
                      <td className={`text-right mono py-2 px-2 ${classOfPnl(t.pnlUsdc)}`}>{fmtUsd(t.pnlUsdc)}</td>
                      <td className="text-right mono text-text-muted py-2 px-2">
                        {formatEntryFee(t.entryFee, t.feeCurrency)}
                      </td>
                      <td className="text-right mono text-text-muted py-2 px-2">{fmtDuration(t.durationMs)}</td>
                      <td className="text-right mono py-2 px-2">{fmtNum(t.quantity, 6)}</td>
                      <td className="text-right py-2 px-2">
                        <button
                          className="btn-danger py-1 px-2 text-[11px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            closeIds([t._id]);
                          }}
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border/30 bg-surface-2/20">
                        <td colSpan={10} className="p-4">
                          <div className="grid xl:grid-cols-[1fr_320px] gap-4">
                            <PositionChart
                              symbol={t.pair}
                              exchange={t.exchange === "kraken" ? "kraken" : "binance"}
                              assetClass={t.assetClass === "tokenized_asset" ? "tokenized_asset" : "crypto"}
                              testnet={settingsData?.binanceTestnet === true}
                              entryPrice={t.entryPrice}
                              stopLoss={t.stopLoss}
                              takeProfit={t.takeProfit}
                              quantity={t.quantity}
                              entryFee={t.entryFee}
                              feeCurrency={t.feeCurrency}
                            />
                            <div className="space-y-3 text-xs">
                              <div className="rounded-lg border border-border/50 bg-surface-2/40 p-3">
                                <div className="text-[10px] uppercase mono tracking-widest text-text-muted mb-1">
                                  AI Entry Reasoning
                                </div>
                                <div className="text-text-primary leading-relaxed">
                                  {t.aiReasoning || "—"}
                                </div>
                                <div className="mt-2 text-text-muted text-[10px]">
                                  {t.aiProvider} · {t.aiModel} · conf {t.aiConfidence ?? "—"}%
                                </div>
                              </div>
                              {t.technicalIndicators && (
                                <div className="rounded-lg border border-border/50 bg-surface-2/40 p-3">
                                  <div className="text-[10px] uppercase mono tracking-widest text-text-muted mb-1">
                                    Entry Snapshot
                                  </div>
                                  <div className="mono text-[11px] grid grid-cols-2 gap-x-3 gap-y-1">
                                    <div>RSI: {fmtNum(t.technicalIndicators.rsi, 2)}</div>
                                    <div>MACD h: {fmtNum(t.technicalIndicators.macd?.histogram, 4)}</div>
                                    <div>EMA20: {fmtNum(t.technicalIndicators.ema20, 4)}</div>
                                    <div>EMA50: {fmtNum(t.technicalIndicators.ema50, 4)}</div>
                                    <div>BB u: {fmtNum(t.technicalIndicators.bb?.upper, 4)}</div>
                                    <div>BB l: {fmtNum(t.technicalIndicators.bb?.lower, 4)}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
