# NEXUS TRADE

**Autonomous AI-Powered Crypto Trading Dashboard** · Next.js 15 (App Router) · MongoDB · Binance · Claude / Gemini / Ollama

![stack](https://img.shields.io/badge/next-15-black) ![mongo](https://img.shields.io/badge/mongodb-atlas-green) ![binance](https://img.shields.io/badge/binance-spot-yellow)

NEXUS TRADE is a full-stack trading cockpit that lets an LLM autonomously analyse the crypto market every 15 minutes, open positions via Binance OCO orders, and manage risk on a 5-minute cadence. It ships with a glassmorphic 2026 dark UI, real-time dashboard, history ledger, per-pair AI analysis view, and a fully dynamic settings panel that mirrors the database into `process.env` at runtime.

---

## Screens

- `/dashboard` — portfolio stats, live mark-to-market, P&L charts, hourly bars, daily heatmap, AI decision log, top pairs, market overview
- `/positions` — expandable open positions with AI reasoning & entry indicators, bulk close
- `/history` — complete ledger, filters, stats (win rate, Sharpe est.), CSV export
- `/analysis` — latest AI analysis per pair with candlestick chart + indicators
- `/settings` — AI provider, trading controls, Binance API, notifications

---

## Tech Stack

| Layer          | Technology                                                   |
|----------------|--------------------------------------------------------------|
| Framework      | Next.js 15 (App Router) + React 18                           |
| Data           | MongoDB + Mongoose                                           |
| Exchange       | Binance Spot REST (native `fetch` wrapper, Testnet / Live)  |
| AI Providers   | Anthropic Claude, Google Gemini, local Ollama                |
| Charts         | Recharts + Lightweight Charts                                |
| Styling        | Tailwind CSS + custom "NEXUS TRADE" 2026 design system       |
| Cron           | `node-cron` + API-triggerable routes                         |
| Auth           | NextAuth (single-user credentials)                           |
| Encryption     | AES-256-GCM for stored API keys/secrets                      |
| Notifications  | Telegram bot                                                 |

---

## Quick Start

```bash
# 1. Install deps (Windows / PowerShell users: npm already works)
npm install --legacy-peer-deps

# 2. Copy env template and fill values
cp .env.local.example .env.local

# 3. Start Next.js (cron triggers live on demand via API)
npm run dev

# 4. (Optional) Start the standalone cron worker in a second terminal
npm run worker
```

Open http://localhost:3000 — you'll be redirected to `/dashboard`.

> **Tip:** Turn on **Dry Run Mode** in `/settings` for your first session. All signals are processed, but no real orders are sent to Binance.

---

## Environment Variables

All values below can be set once in `.env.local`. Trading-related values can *also* be edited live from `/settings` and are written back into `process.env` at runtime.

```env
# ----- Core -----
MONGODB_URI=mongodb://localhost:27017/nexustrade
NEXTAUTH_SECRET=<long-random-string>
NEXTAUTH_URL=http://localhost:3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
ENCRYPTION_KEY=<32-char-key-for-AES-256-GCM>

# ----- Binance (also settable from UI) -----
BINANCE_API_KEY=
BINANCE_API_SECRET=
BINANCE_TESTNET=true

# ----- AI -----
AI_PROVIDER=claude          # claude | gemini | ollama
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
GOOGLE_API_KEY=
GOOGLE_MODEL=gemini-2.0-flash
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# ----- Notifications (optional) -----
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## Architecture

```
┌──────────────────────── Next.js 15 (App Router) ───────────────────────┐
│                                                                        │
│  UI (/dashboard, /positions, /history, /analysis, /settings)           │
│     ↕ SWR (10s revalidate)                                             │
│  API routes  (/api/dashboard, /api/trades, /api/analysis, /api/cron)   │
│     ↕                                                                  │
│  src/lib/{db,settings,binance,ai,indicators,trading,notify,crypto}     │
│     ↕                                                                  │
│  src/workers/{analysisCron, positionCron, scheduler}                   │
│                                                                        │
└────────────────────┬─────────────────────────────────────┬─────────────┘
                     │                                     │
                     ▼                                     ▼
              MongoDB (Mongoose)                     Binance REST
              Settings, Trade,                        Testnet / Live
              Analysis, AILog
```

### Key flows

**Analysis cron (every 15 min / manual):**
1. Scanner pulls top-50 USDC pairs by 24h quote volume, filters stables & thin markets.
2. For up to 5 pairs in parallel it fetches 1h + 15m candles, computes RSI / MACD / Bollinger / EMA20 / EMA50.
3. Builds the structured analysis prompt and calls the configured AI (Claude / Gemini / Ollama).
4. Parses strict JSON, stores an `Analysis` doc and an `AILog` entry.
5. If `recommendation ∈ {BUY, STRONG_BUY}` and `confidence ≥ minConfidence`, and open-pair budget allows, calls `openPosition()`.

**Open position flow:**
1. Market BUY via quoteOrderQty (USDC-denominated sizing).
2. Immediately places an OCO sell: TP = price × (1 + TP%), SL = price × (1 − SL%), stopLimit = SL × 0.999.
3. Persists `Trade` with `binanceOrderId` + `ocoOrderId`.
4. If `dryRun` is on, no real orders are sent — the trade record is stamped `dryRun: true`.

**Position cron (every 5 min / manual):**
1. For each `OPEN` trade: fetch live price, compute MTM.
2. If price ≥ TP → auto-close (`TP_HIT`). If price ≤ SL → auto-close (`SL_HIT`).
3. Otherwise: recompute indicators on 15m, call AI with position-check prompt.
4. If AI says `SELL_NOW` with confidence ≥ 80% → cancel OCO + market sell (`AI_DECISION`).

**Close flow:** cancels the OCO, places a market sell, updates the Trade with exit price / reason / P&L, and logs to `AILog` + optional Telegram ping.

### Scheduler

There are two ways to drive the crons:

- **API-triggered** — `/api/cron/analysis` and `/api/cron/positions` are idempotent and run the workers on demand. Point any scheduler at them (Vercel Cron, GitHub Actions, cron-job.org, etc.).
- **Embedded worker** — `npm run worker` boots `node-cron` locally (every 15m and every 5m). Use this on a Linux VPS / selfhost.

Both respect the `pilotActive` / `analysisCronActive` / `positionCheckCronActive` flags — flip them from `/settings` to pause everything with a single toggle.

---

## Database Schemas

| Collection | Purpose                                                        |
|------------|----------------------------------------------------------------|
| `settings` | Single-document live config (AI, Binance, risk, cron toggles) |
| `trades`   | Every opened position, OPEN / CLOSED / CANCELLED              |
| `analyses` | Per-pair AI analysis snapshots with indicators + reasoning    |
| `ailogs`   | Append-only decision feed (ANALYSIS, BUY/SELL_SIGNAL, …)      |

Secrets (Binance key/secret, AI API key, Telegram token) are stored in MongoDB **encrypted at rest** with AES-256-GCM using `ENCRYPTION_KEY`. They are decrypted only in memory when `getSettings()` runs, and masked in API responses.

---

## Safety

- **Dry Run Mode** simulates the full decision + record flow without sending orders to Binance.
- **Testnet** is on by default; switch to Live explicitly from `/settings`.
- **OCO safety**: SL stopLimit is buffered at 0.999× for slippage.
- **Confidence gate**: no order is opened unless AI confidence ≥ user-set threshold.
- **Pair cap**: `maxOpenPairs` is enforced on every analysis pass.
- **Confirmation dialog**: saving new Binance keys requires a confirm step in the UI.

---

## Project Layout

```
src/
├─ app/
│  ├─ layout.tsx · globals.css · page.tsx (redirects to /dashboard)
│  ├─ dashboard/page.tsx
│  ├─ positions/page.tsx
│  ├─ history/page.tsx
│  ├─ analysis/page.tsx
│  ├─ settings/page.tsx
│  └─ api/
│     ├─ auth/[...nextauth]/route.ts
│     ├─ dashboard/{stats,pnl,hourly,daily,top-pairs}/route.ts
│     ├─ trades/{open,history,close/[id]}/route.ts
│     ├─ analysis/latest/route.ts
│     ├─ logs/route.ts
│     ├─ market/overview/route.ts
│     ├─ settings/{route.ts, test-ai, test-binance}/route.ts
│     └─ cron/{analysis,positions}/route.ts
├─ components/
│  ├─ layout/{Sidebar, TopBar, Providers}.tsx
│  ├─ ui/Card.tsx
│  ├─ dashboard/{PnlChart, HourlyBars, DailyHeatmap, AIDecisionLog, TopPairs, MarketOverview, OpenPositionsTable}.tsx
│  └─ analysis/MiniChart.tsx
├─ lib/
│  ├─ db.ts · crypto.ts · settings.ts · utils.ts
│  ├─ binance.ts · ai.ts · indicators.ts · trading.ts · notify.ts
├─ models/
│  └─ Settings.ts · Trade.ts · Analysis.ts · AILog.ts
└─ workers/
   ├─ analysisCron.ts · positionCron.ts · scheduler.ts
```

---

## Design System

Dark-only 2026 aesthetic. Glassmorphism cards with backdrop-blur, cyan (`#00F5FF`) neon borders on active elements, violet (`#7B2FFF`) secondary accents, neon-green profits, neon-red losses. Fonts: Syne (headings), JetBrains Mono (numbers), DM Sans (body). A subtle scanline overlay and animated radial mesh background pervade every screen.

---

## License

MIT. Use at your own risk — this is a research / personal-use trading tool, not investment advice.
