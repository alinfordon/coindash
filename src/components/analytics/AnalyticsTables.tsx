"use client";

import type { AnalyticsReport } from "@/lib/analytics";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { classOfPnl, fmtPct, fmtUsd } from "@/lib/utils";

function fmtPf(n: number) {
  if (n >= 998) return "∞";
  return n.toFixed(2);
}

function fmtHold(min: number | null | undefined) {
  if (min == null || !Number.isFinite(min)) return "—";
  if (min >= 1440) return `${(min / 1440).toFixed(1)}d`;
  if (min >= 60) return `${(min / 60).toFixed(1)}h`;
  return `${Math.round(min)}m`;
}

export function AnalyticsTables({ report }: { report: AnalyticsReport }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-10">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Strategy Breakdown</CardTitle>
          <Badge variant="neutral">{report.strategyBreakdown.length} profiles</Badge>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Strategy</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">Win%</TableHead>
              <TableHead className="text-right">PnL</TableHead>
              <TableHead className="text-right">Avg Win</TableHead>
              <TableHead className="text-right">Avg Loss</TableHead>
              <TableHead className="text-right">PF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.strategyBreakdown.map((s) => (
              <TableRow key={s.strategy}>
                <TableCell className="font-semibold">{s.strategy}</TableCell>
                <TableCell className="text-right">{s.trades}</TableCell>
                <TableCell className="text-right mono">{(s.winRate * 100).toFixed(1)}%</TableCell>
                <TableCell className={`text-right mono ${classOfPnl(s.pnl)}`}>{fmtUsd(s.pnl)}</TableCell>
                <TableCell className="text-right mono text-profit">{fmtUsd(s.avgWin)}</TableCell>
                <TableCell className="text-right mono text-loss">{fmtUsd(s.avgLoss)}</TableCell>
                <TableCell className="text-right mono">{fmtPf(s.profitFactor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 Pairs</CardTitle>
          <Badge variant="success">Leaders</Badge>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pair</TableHead>
              <TableHead className="text-right">PnL</TableHead>
              <TableHead className="text-right">n</TableHead>
              <TableHead className="text-right">Win%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.topPairs.map((r) => (
              <TableRow key={r.pair}>
                <TableCell className="font-semibold">{r.pair}</TableCell>
                <TableCell className={`text-right mono ${classOfPnl(r.pnl)}`}>{fmtUsd(r.pnl)}</TableCell>
                <TableCell className="text-right">{r.trades}</TableCell>
                <TableCell className="text-right mono">{r.trades ? ((r.wins / r.trades) * 100).toFixed(1) : "—"}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Worst 10 Pairs</CardTitle>
          <Badge variant="danger">Tail risk</Badge>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pair</TableHead>
              <TableHead className="text-right">PnL</TableHead>
              <TableHead className="text-right">n</TableHead>
              <TableHead className="text-right">Win%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.worstPairs.map((r) => (
              <TableRow key={r.pair}>
                <TableCell className="font-semibold">{r.pair}</TableCell>
                <TableCell className={`text-right mono ${classOfPnl(r.pnl)}`}>{fmtUsd(r.pnl)}</TableCell>
                <TableCell className="text-right">{r.trades}</TableCell>
                <TableCell className="text-right mono">{r.trades ? ((r.wins / r.trades) * 100).toFixed(1) : "—"}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
          <Badge variant={report.filters.includeOpenInRecent ? "accent" : "neutral"}>
            {report.filters.includeOpenInRecent ? "OPEN + CLOSED" : "CLOSED"}
          </Badge>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead className="text-right">PnL</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="text-right">Hold</TableHead>
              <TableHead className="text-right">Closed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.recentTrades.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-semibold">{t.symbol}</TableCell>
                <TableCell>{t.side}</TableCell>
                <TableCell>
                  <Badge variant={t.status === "OPEN" ? "warning" : "neutral"}>{t.status}</Badge>
                </TableCell>
                <TableCell className="max-w-[140px] truncate" title={t.strategy}>
                  {t.strategy}
                </TableCell>
                <TableCell className={`text-right mono ${t.pnl == null ? "text-text-muted" : classOfPnl(t.pnl)}`}>
                  {t.pnl == null ? "—" : fmtUsd(t.pnl)}
                </TableCell>
                <TableCell className={`text-right mono ${t.pnlPercent == null ? "text-text-muted" : classOfPnl(t.pnlPercent)}`}>
                  {t.pnlPercent == null ? "—" : fmtPct(t.pnlPercent)}
                </TableCell>
                <TableCell className="text-right mono">{t.fee == null ? "—" : fmtUsd(t.fee)}</TableCell>
                <TableCell className="text-right">{fmtHold(t.durationMinutes)}</TableCell>
                <TableCell className="text-right text-[11px] text-text-muted whitespace-nowrap">
                  {t.closedAt ? new Date(t.closedAt).toLocaleString() : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
