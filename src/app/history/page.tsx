"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, Stat } from "@/components/ui/Card";
import { classOfPnl, fmtDuration, fmtNum, fmtPct, fmtUsd } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";

const PAGE_SIZE = 25;

function buildHistoryQuery(params: {
  pair: string;
  outcome: string;
  aiModel: string;
  closedReason: string;
  from: string;
  to: string;
  page: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.pair) qs.set("pair", params.pair);
  if (params.outcome) qs.set("outcome", params.outcome);
  if (params.aiModel) qs.set("aiModel", params.aiModel);
  if (params.closedReason) qs.set("closedReason", params.closedReason);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  qs.set("page", String(params.page));
  qs.set("limit", String(params.limit ?? PAGE_SIZE));
  return qs.toString();
}

export default function HistoryPage() {
  const [pair, setPair] = useState("");
  const [outcome, setOutcome] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [closedReason, setClosedReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [reclassifying, setReclassifying] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [pair, outcome, aiModel, closedReason, from, to]);

  const qs = buildHistoryQuery({ pair, outcome, aiModel, closedReason, from, to, page });

  const { data, mutate } = useSWR<{
    trades: any[];
    stats: Record<string, number>;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>(`/api/trades/history?${qs}`);
  const trades = data?.trades || [];
  const stats = data?.stats || {};
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 0;
  const total = pagination?.total ?? stats.total ?? 0;
  const limit = pagination?.limit ?? PAGE_SIZE;
  const rangeStart = total ? (page - 1) * limit + 1 : 0;
  const rangeEnd = total ? Math.min(page * limit, total) : 0;

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  async function exportCsv() {
    const tradesAll: any[] = [];
    let p = 1;
    while (true) {
      const res = await fetch(`/api/trades/history?${buildHistoryQuery({ pair, outcome, aiModel, closedReason, from, to, page: p })}`);
      const j = await res.json();
      tradesAll.push(...(j.trades || []));
      const tp = j.pagination?.totalPages ?? 0;
      if (!j.trades?.length || p >= tp) break;
      p += 1;
    }

    const rows = [
      [
        "pair",
        "side",
        "openedAt",
        "closedAt",
        "entryPrice",
        "exitPrice",
        "quantity",
        "usdcValue",
        "pnlUsdc",
        "pnlPercent",
        "closedReason",
        "aiProvider",
        "aiModel",
        "aiConfidence",
      ],
      ...tradesAll.map((t) => [
        t.pair,
        t.side,
        t.openedAt,
        t.closedAt,
        t.entryPrice,
        t.exitPrice,
        t.quantity,
        t.usdcValue,
        t.pnlUsdc,
        t.pnlPercent,
        t.closedReason,
        t.aiProvider,
        t.aiModel,
        t.aiConfidence,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-trade-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  async function reclassifyReconciled() {
    if (
      !confirm(
        "Recalculează tranzacțiile RECONCILED folosind fills Binance (OCO / myTrades)?\n\nDoar rândurile cu dovadă pe exchange sunt actualizate. Poate dura câteva minute."
      )
    ) {
      return;
    }
    setReclassifying(true);
    toast.loading("Reclasificare RECONCILED…", { id: "reclassify" });
    try {
      const res = await fetch("/api/positions/reclassify-reconciled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "reclassify failed");
      await mutate();
      toast.success(
        `Actualizate ${j.updated}/${j.scanned} · sărite ${j.skipped ?? 0} (fără fill exchange)`,
        { id: "reclassify", duration: 10000 }
      );
    } catch (e: any) {
      toast.error(e.message || "Reclasificare eșuată", { id: "reclassify" });
    } finally {
      setReclassifying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Trade History</h1>
          <p className="text-sm text-text-muted mt-1 mono">
            CLOSED TRADES · same dust rules as dashboard & stats
            {(stats.reconciledCount ?? 0) > 0 && (
              <span className="ml-2 text-warning">
                · {stats.reconciledCount} RECONCILED (posibil TP/SL neetichetat)
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(stats.reconciledCount ?? 0) > 0 && (
            <button
              className="btn"
              onClick={reclassifyReconciled}
              disabled={reclassifying}
              title="Recalculează RECONCILED din fills Binance"
            >
              <RefreshCw className={`h-4 w-4 ${reclassifying ? "animate-spin" : ""}`} />
              {reclassifying ? "Reclasificare…" : "Reclassify RECONCILED"}
            </button>
          )}
          <button className="btn" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-7 gap-3">
        <Stat
          label="Net P&L"
          value={<span className={classOfPnl(stats.netPnl ?? 0)}>{fmtUsd(stats.netPnl ?? 0)}</span>}
          sub={<span className="mono text-text-muted">filtered closed</span>}
          accent={(stats.netPnl ?? 0) >= 0 ? "success" : "danger"}
        />
        <Stat label="Total Trades" value={<span className="mono">{stats.total ?? 0}</span>} />
        <Stat
          label="Win Rate"
          value={<span className="mono">{(stats.winRate ?? 0).toFixed(1)}%</span>}
          accent="success"
        />
        <Stat
          label="Avg Profit"
          value={<span className="text-profit mono">{fmtUsd(stats.avgProfit ?? 0)}</span>}
          accent="success"
        />
        <Stat
          label="Avg Loss"
          value={<span className="text-loss mono">{fmtUsd(stats.avgLoss ?? 0)}</span>}
          accent="danger"
        />
        <Stat
          label="Largest Win"
          value={<span className="text-profit mono">{fmtUsd(stats.largestWin ?? 0)}</span>}
        />
        <Stat
          label="Sharpe (est)"
          value={<span className="mono">{stats.sharpe ?? 0}</span>}
          sub={<span className="mono text-text-muted">Largest loss {fmtUsd(stats.largestLoss ?? 0)}</span>}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input className="input" placeholder="Pair (e.g. BTCUSDC)" value={pair} onChange={(e) => setPair(e.target.value.toUpperCase())} />
          <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">All outcomes</option>
            <option value="profit">Profit</option>
            <option value="loss">Loss</option>
          </select>
          <select className="input" value={closedReason} onChange={(e) => setClosedReason(e.target.value)}>
            <option value="">All reasons</option>
            <option value="TP_HIT">TP_HIT</option>
            <option value="SL_HIT">SL_HIT</option>
            <option value="RECONCILED">RECONCILED</option>
            <option value="AI_DECISION">AI_DECISION</option>
            <option value="MANUAL">MANUAL</option>
          </select>
          <input className="input" placeholder="AI Model" value={aiModel} onChange={(e) => setAiModel(e.target.value)} />
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Closed Trades</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-text-muted border-b border-border/70">
              <tr>
                <th className="text-left py-2 px-2">Pair</th>
                <th className="text-left py-2 px-2">Opened</th>
                <th className="text-left py-2 px-2">Closed</th>
                <th className="text-right py-2 px-2">Entry</th>
                <th className="text-right py-2 px-2">Exit</th>
                <th className="text-right py-2 px-2">Gross P&L</th>
                <th className="text-right py-2 px-2">P&L %</th>
                <th className="text-right py-2 px-2">Duration</th>
                <th className="text-right py-2 px-2">Reason</th>
                <th className="text-right py-2 px-2">AI</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-text-muted">
                    No closed trades matching the filters.
                  </td>
                </tr>
              )}
              {trades.map((t) => {
                const dur = new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime();
                return (
                  <tr key={t._id} className="border-b border-border/30 hover:bg-surface-2/30">
                    <td className="py-2 px-2 mono font-semibold">{t.pair}</td>
                    <td className="py-2 px-2 mono text-text-muted text-xs">
                      {new Date(t.openedAt).toLocaleString("en-US", { hour12: false })}
                    </td>
                    <td className="py-2 px-2 mono text-text-muted text-xs">
                      {new Date(t.closedAt).toLocaleString("en-US", { hour12: false })}
                    </td>
                    <td className="text-right mono py-2 px-2">{fmtNum(t.entryPrice, 4)}</td>
                    <td className="text-right mono py-2 px-2">{fmtNum(t.exitPrice, 4)}</td>
                    <td className={`text-right mono py-2 px-2 ${classOfPnl(t.pnlUsdc)}`}>{fmtUsd(t.pnlUsdc)}</td>
                    <td className={`text-right mono py-2 px-2 ${classOfPnl(t.pnlPercent)}`}>{fmtPct(t.pnlPercent)}</td>
                    <td className="text-right mono text-text-muted py-2 px-2">{fmtDuration(dur)}</td>
                    <td className="text-right mono text-xs py-2 px-2">
                      <span
                        className={`chip ${
                          t.closedReason === "TP_HIT"
                            ? "border-success/40 text-success"
                            : t.closedReason === "SL_HIT"
                            ? "border-danger/40 text-danger"
                            : t.closedReason === "RECONCILED"
                            ? "border-warning/50 text-warning"
                            : "border-border text-text-muted"
                        }`}
                      >
                        {t.closedReason || "—"}
                      </span>
                    </td>
                    <td className="text-right mono text-xs text-text-muted py-2 px-2">
                      {t.aiProvider} / {t.aiModel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/30 px-2 py-3">
          <p className="text-xs text-text-muted mono">
            {total ? `${rangeStart}–${rangeEnd} of ${total}` : "0 results"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn py-1.5 px-2 disabled:opacity-40 disabled:pointer-events-none"
              disabled={page <= 1 || totalPages === 0}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm mono text-text-muted min-w-[5rem] text-center">
              {totalPages ? `${page} / ${totalPages}` : "—"}
            </span>
            <button
              type="button"
              className="btn py-1.5 px-2 disabled:opacity-40 disabled:pointer-events-none"
              disabled={totalPages === 0 || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
