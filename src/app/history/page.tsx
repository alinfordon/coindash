"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card, CardHeader, CardTitle, Stat } from "@/components/ui/Card";
import { classOfPnl, fmtDuration, fmtNum, fmtPct, fmtUsd } from "@/lib/utils";
import { Download } from "lucide-react";

export default function HistoryPage() {
  const [pair, setPair] = useState("");
  const [outcome, setOutcome] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const qs = new URLSearchParams();
  if (pair) qs.set("pair", pair);
  if (outcome) qs.set("outcome", outcome);
  if (aiModel) qs.set("aiModel", aiModel);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  const { data } = useSWR<{ trades: any[]; stats: any }>(`/api/trades/history?${qs.toString()}`);
  const trades = data?.trades || [];
  const stats = data?.stats || {};

  function exportCsv() {
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
      ...trades.map((t) => [
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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Trade History</h1>
          <p className="text-sm text-text-muted mt-1 mono">CLOSED TRADES · FULL LEDGER</p>
        </div>
        <button className="btn" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="grid md:grid-cols-6 gap-3">
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input className="input" placeholder="Pair (e.g. BTCUSDC)" value={pair} onChange={(e) => setPair(e.target.value.toUpperCase())} />
          <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">All outcomes</option>
            <option value="profit">Profit</option>
            <option value="loss">Loss</option>
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
      </Card>
    </div>
  );
}
