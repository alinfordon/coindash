import fs from "fs";

const path = process.argv[2];
const raw = fs.readFileSync(path, "utf8");
const lines = raw.trim().split(/\r?\n/);

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const header = parseCsvLine(lines[0]);
const rows = lines.slice(1).map(parseCsvLine);
const idx = (n) => header.indexOf(n);

const pnls = rows.map((r) => +r[idx("pnlUsdc")] || 0);
const pairs = rows.map((r) => r[idx("pair")]);
const reasons = rows.map((r) => r[idx("closedReason")]);
const values = rows.map((r) => +r[idx("usdcValue")] || 0);
const models = rows.map((r) => r[idx("aiModel")]);
const opened = rows.map((r) => new Date(r[idx("openedAt")]).getTime()).filter(Boolean);
const closed = rows.map((r) => new Date(r[idx("closedAt")]).getTime()).filter(Boolean);

const wins = pnls.filter((p) => p > 0);
const losses = pnls.filter((p) => p < 0);
const net = pnls.reduce((a, b) => a + b, 0);
const grossP = wins.reduce((a, b) => a + b, 0);
const grossL = losses.reduce((a, b) => a + b, 0);
const wr = rows.length ? (wins.length / rows.length) * 100 : 0;
const pf = Math.abs(grossL) > 1e-9 ? grossP / Math.abs(grossL) : grossP > 0 ? 999 : 0;

const chrono = [...rows].sort(
  (a, b) => new Date(a[idx("closedAt")]).getTime() - new Date(b[idx("closedAt")]).getTime()
);
let peak = -Infinity;
let maxDd = 0;
let cum = 0;
for (const r of chrono) {
  cum += +r[idx("pnlUsdc")] || 0;
  if (cum > peak) peak = cum;
  maxDd = Math.max(maxDd, peak - cum);
}

const byPair = {};
for (let i = 0; i < rows.length; i++) {
  const p = pairs[i];
  if (!byPair[p]) byPair[p] = { n: 0, pnl: 0, wins: 0 };
  byPair[p].n++;
  byPair[p].pnl += pnls[i];
  if (pnls[i] > 0) byPair[p].wins++;
}

const byModel = {};
for (let i = 0; i < rows.length; i++) {
  const m = models[i] || "?";
  if (!byModel[m]) byModel[m] = { n: 0, pnl: 0, wins: 0 };
  byModel[m].n++;
  byModel[m].pnl += pnls[i];
  if (pnls[i] > 0) byModel[m].wins++;
}

const reasonCounts = {};
reasons.forEach((r) => {
  reasonCounts[r] = (reasonCounts[r] || 0) + 1;
});

const dust = values.filter((v) => v > 0 && v < 1).length;
const size10 = values.filter((v) => v === 10).length;
const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;

const durations = rows
  .map((r) => new Date(r[idx("closedAt")]).getTime() - new Date(r[idx("openedAt")]).getTime())
  .filter((d) => d > 0);
const avgDurMin = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length / 60000 : 0;

const top = Object.entries(byPair)
  .sort((a, b) => b[1].pnl - a[1].pnl)
  .slice(0, 8);
const worst = Object.entries(byPair)
  .sort((a, b) => a[1].pnl - b[1].pnl)
  .slice(0, 8);

console.log(
  JSON.stringify(
    {
      trades: rows.length,
      netPnlUsd: +net.toFixed(4),
      winRatePct: +wr.toFixed(2),
      profitFactor: +Math.min(pf, 999).toFixed(3),
      wins: wins.length,
      losses: losses.length,
      avgWinUsd: +avgWin.toFixed(4),
      avgLossUsd: +avgLoss.toFixed(4),
      largestWinUsd: +Math.max(...wins, 0).toFixed(4),
      largestLossUsd: +Math.min(...losses, 0).toFixed(4),
      maxDrawdownUsdOnCumulativePnl: +maxDd.toFixed(4),
      finalCumulativePnl: +cum.toFixed(4),
      peakCumulativePnl: +peak.toFixed(4),
      avgHoldMinutes: +avgDurMin.toFixed(1),
      usdcValueExactly10: size10,
      dustUnder1Usd: dust,
      dateRange: {
        firstClosed: chrono[0]?.[idx("closedAt")],
        lastClosed: chrono[chrono.length - 1]?.[idx("closedAt")],
      },
      closedReasons: reasonCounts,
      byModel: Object.fromEntries(
        Object.entries(byModel).map(([k, v]) => [
          k,
          { ...v, pnl: +v.pnl.toFixed(4), wr: +((v.wins / v.n) * 100).toFixed(1) },
        ])
      ),
      topPairs: top.map(([k, v]) => ({ pair: k, ...v, pnl: +v.pnl.toFixed(4), wr: +((v.wins / v.n) * 100).toFixed(1) })),
      worstPairs: worst.map(([k, v]) => ({ pair: k, ...v, pnl: +v.pnl.toFixed(4), wr: +((v.wins / v.n) * 100).toFixed(1) })),
    },
    null,
    2
  )
);
