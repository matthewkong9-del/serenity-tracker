# Serenity Tracker

A self-running investment research platform that tracks stocks mentioned by the investor **Serenity** ([@aleaboreddit](https://x.com/aleaboreddit)), extracts falsifiable claims from his tweets, and cross-references them against uploaded documents and web sources using DeepSeek's LLM.

The system runs **autonomously** — it fetches tweets, extracts claims, scores impact, routes high-priority items to Telegram for human review, researches claims against web sources, generates supply-chain analysis summaries, and maps competitive relationships. All driven by an in-process scheduler with a persisted task queue.

## How It Works

```
                   ┌──────────────────────────────┐
                   │     Google Sheets CSV         │
                   │  (Serenity's tweet archive)   │
                   └──────────────┬───────────────┘
                                  │ hourly ingest
                                  ▼
                   ┌──────────────────────────────┐
                   │     Tweet Ingestion           │
                   │  dedup (SHA-256) → AI extract │
                   │  claims + tickers + concepts  │
                   └──────────────┬───────────────┘
                                  │
                   ┌──────────────┼───────────────┐
                   │              ▼                │
                   │     Impact Scoring            │
                   │   (1-5 chokepoint relevance)  │
                   │              │                │
                   │    ┌─────────┴─────────┐      │
                   │    ▼                   ▼      │
                   │  low impact         high      │
                   │  (≤3)              impact     │
                   │    │               (≥4)       │
                   │    │                 │        │
                   │    ▼                 ▼        │
                   │  auto-          Telegram      │
                   │  research       escalation    │
                   │    │                 │        │
                   │    │    ┌────────────┘        │
                   │    │    │ user replies with   │
                   │    │    │ "research 1 3" etc  │
                   │    ▼    ▼                     │
                   │  ┌──────────────┐             │
                   │  │  Research    │             │
                   │  │  Pipeline   │             │
                   │  │              │             │
                   │  │ Exa search   │             │
                   │  │   + Brave    │             │
                   │  │   + DeepSeek │             │
                   │  │   verdict    │             │
                   │  └──────┬───────┘             │
                   │         │                     │
                   │         ▼                     │
                   │  ┌──────────────┐             │
                   │  │  Summarize   │◄────────────┤
                   │  │  (chokepoint │              │
                   │  │   analysis)  │              │
                   │  └──────┬───────┘             │
                   │         │                     │
                   │         ▼                     │
                   │  ┌──────────────┐             │
                   │  │ Relationship │             │
                   │  │   Mapping    │             │
                   │  │ + Contrarian │             │
                   │  └──────┬───────┘             │
                   │         │                     │
                   │         ▼                     │
                   │  ┌──────────────┐             │
                   │  │  Narrative + │             │
                   │  │  Decision    │             │
                   │  └──────────────┘             │
                   └───────────────────────────────┘
```

### The Core Loop

1. **Ingest** — every hour, tweets are fetched from a Google Sheets CSV, deduplicated by content hash, and run through DeepSeek to extract claims, stock tickers, and concepts.

2. **Triage** — each claim gets an impact score (1–5). Low-impact claims (≤3) go straight to automated research. High-impact claims (≥4) are escalated to Telegram for human review. The user replies with `research 1 2 3` or `deep 1` to approve investigation.

3. **Research** — the research pipeline searches the web (Exa + Brave fallback) and asks DeepSeek to evaluate the claim against real evidence. Results become the claim's authoritative verdict: `supported`, `refuted`, `disputed`, or left `unverified` when evidence is insufficient. Deep research mode runs two adversarial passes (confirm + refute).

4. **Summarize** — when a stock has new data, DeepSeek generates a structured supply-chain analysis: stance (bullish/bearish/neutral), chokepoint depth (1–5), demand certainty, asymmetric setup, risk/anti-thesis, and evidence quality. The summary becomes the "AI Memory" block on the stock page.

5. **Relationship Mapping** — two LLM passes per stock: a supply-chain map (competitors, partners, suppliers, moats, policy links) and a contrarian scan (hidden risks, second-order effects, dark horses). Connections are confidence-labeled: confirmed, speculative, or gap.

6. **Narrative + Decision** — after summarization, a conversational knowledge-base story is generated. An investment maturity ladder tracks each stock from `beginning` → `core` → `actionable` with buy/hold/sell recommendations.

### The Autonomous Layer

Everything above runs on autopilot. The **scheduler** (in-process, every 30s) drains a persisted **task queue** — research, summarize, extract, narrative, and decision tasks are claimed atomically and executed with bounded retries (3 attempts, exponential backoff). A **watchdog** scans for stuck runs every 5 minutes; an **ops agent** auto-fixes infrastructure issues. Twelve specialized agents handle different concerns: ingest, price refresh, auditor, editor, cleanup, decision, scoring, analysis, and research.

## Features

- **Tweet Sync** — fetch from Google Sheets CSV, AI extraction of claims/tickers/concepts
- **Claim Verification** — web research pipeline (Exa → Brave → DeepSeek verdict) with adversarial deep mode
- **Supply-Chain Analysis** — chokepoint depth, demand certainty, asymmetric setups, anti-thesis
- **Relationship Mind Map** — AI-discovered competitor/partner/supplier/moat/policy/gap connections
- **Contrarian Angles** — devil's advocate analysis: what kills the thesis, dark horses, hidden risks
- **Investment Decisions** — maturity ladder (beginning → core → actionable) with buy/hold/sell
- **Portfolio View** — cross-stock urgency ranking, thesis drift tracking, AI-generated research plans
- **Concept Taxonomy** — technology/supply-chain/market-theme tagging across tweets
- **Telegram Bot** — notifications for new tweets, user can approve/reject research from phone
- **Drag-and-Drop Files** — upload PDFs, DOCXs, images, HTML, audio — auto-converted to Markdown for AI
- **Multi-Currency** — 200+ stocks across US, Japan, Taiwan, Korea, Europe, Hong Kong with USD normalization
- **Dark Theme** — custom CSS variable system, responsive design
- **Fully Autonomous** — in-process scheduler, persisted task queue, watchdog + ops self-healing

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Database | SQLite via Prisma ORM (WAL mode) |
| Styling | Tailwind CSS 3 (dark theme, custom CSS variables) |
| AI / LLM | DeepSeek Chat API (`deepseek-v4-pro`) |
| File Conversion | `markit-ai` CLI (PDF, DOCX, images, audio, HTML → Markdown) |
| PDF Viewing | `mupdf` + iframe for in-browser rendering |
| Stock Prices | Finnhub + Yahoo Finance + Alpha Vantage (multi-source fallback) |
| Web Search | Exa API (primary) + Brave Search (fallback) |
| Notifications | Telegram Bot API (polling + send) |
| Process Manager | PM2 |
| Testing | Vitest |

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- A DeepSeek API key ([platform.deepseek.com](https://platform.deepseek.com))
- (Optional) Exa API key for web research ([exa.ai](https://exa.ai))
- (Optional) Telegram Bot Token + Chat ID for notifications
- (Optional) Finnhub API key for stock prices
- (Optional) Alpha Vantage API key for international stock fundamentals

### Setup

```bash
# Clone and install
git clone <repo-url>
cd serenity-tracker
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys (see below)

# Initialize the database
npx prisma db push

# Seed ~100 stocks from the curated master list
node seed-stocks.js

# Start dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Environment Variables

```bash
# Required
DATABASE_URL="file:../data/tracker.db"   # SQLite path
DEEPSEEK_API_KEY=sk-your-key-here       # DeepSeek API key

# Optional — web research
EXA_API_KEY=your-exa-key-here           # Exa search (20K free req/month)

# Optional — Telegram notifications
TELEGRAM_BOT_TOKEN=123:abc              # From @BotFather
TELEGRAM_CHAT_ID=456789                 # Your chat ID

# Optional — stock prices (multi-source fallback)
FINNHUB_API_KEY=your-key-here           # Primary price source
ALPHA_VANTAGE_API_KEY=your-key-here     # International fundamentals (25 free/day)

# Optional — tweet sync
SYNC_CSV_URL=https://docs.google.com/...  # Google Sheets CSV export URL

# Optional — tweak behavior
AI_PROVIDER=deepseek                    # or "zai" for Z.AI GLM
AI_MODEL=deepseek-v4-pro               # model override
ORCHESTRATOR_INTERVAL=30000            # tick interval in ms (default 30s)
```

### Seed Data

`node seed-stocks.js` populates the database with ~100 curated stocks across global markets. The seed script also reports orphan stocks (in DB but not in the master list) so you can clean up stale entries.

## Project Structure

```
serenity-tracker/
├── src/
│   ├── app/                        # Next.js App Router pages + API routes
│   │   ├── page.tsx                # Home — stock grid, sync panel
│   │   ├── layout.tsx              # Root layout with nav
│   │   ├── stocks/[ticker]/        # Stock detail page (tabs, AI summary)
│   │   ├── tweets/                 # All synced tweets
│   │   ├── triage/                 # Pending Telegram reviews
│   │   ├── research/               # Research queue dashboard
│   │   ├── portfolio/              # Cross-stock analysis
│   │   ├── concepts/               # Concept taxonomy view
│   │   ├── claims/                 # All claims view
│   │   ├── cleanup/                # Cleanup task review
│   │   └── api/                    # REST API routes (see below)
│   ├── agents/                     # 12 autonomous agents
│   │   ├── watchdog.ts             # Scans for failures, stuck runs, dead tasks
│   │   ├── ops.ts                  # Auto-fixes infrastructure issues
│   │   ├── ingest.ts               # Tweet sync from Google Sheets CSV
│   │   ├── price.ts                # Daily stock price refresh
│   │   ├── research.ts             # Web research + content coverage
│   │   ├── analysis.ts             # Portfolio-level analysis
│   │   ├── scoring.ts              # Multi-factor opportunity scoring
│   │   ├── decision.ts             # Investment thesis generation
│   │   ├── auditor.ts              # Data quality audits
│   │   ├── editor.ts               # Content quality fixes
│   │   ├── cleanup.ts              # Duplicate detection + cleanup
│   │   └── orchestrator.ts         # Pipeline drain orchestrator
│   ├── lib/                        # Core business logic
│   │   ├── scheduler.ts            # In-process scheduler (30s tick)
│   │   ├── orchestrator.ts         # Main orchestration tick logic
│   │   ├── pending-tasks.ts        # Persisted work queue (ADR-0001)
│   │   ├── deepseek.ts             # LLM client (multi-provider)
│   │   ├── summarize.ts            # AI stock summary generation
│   │   ├── research.ts             # Claim research pipeline
│   │   ├── relationships.ts        # Relationship extraction engine
│   │   ├── narrative.ts            # Knowledge base narrative generation
│   │   ├── decision.ts             # Investment thesis generation
│   │   ├── market-data.ts          # Multi-source price refresh strategy
│   │   ├── finnhub.ts              # Finnhub API wrapper
│   │   ├── alphavantage.ts         # Alpha Vantage API wrapper
│   │   ├── yahoo.ts                # Yahoo Finance scraper
│   │   ├── telegram.ts             # Telegram bot (send + poll)
│   │   ├── scoring.ts              # Multi-factor scoring model
│   │   ├── pipeline-log.ts         # PipelineRun observability
│   │   ├── db.ts                   # Prisma client singleton
│   │   └── content-gather.ts       # Gather all context for a stock
│   ├── components/                 # Shared React components
│   ├── instrumentation.ts          # Server boot: WAL mode + start scheduler
│   └── __tests__/                  # Vitest test files
├── prisma/
│   └── schema.prisma               # 15 models (see Database Schema below)
├── scripts/                        # Maintenance scripts
│   ├── seed-stocks.js              # Stock master list seeder
│   ├── backup.sh                   # DB backup
│   ├── sync-cron.sh                # Manual tweet sync
│   ├── price-cron.sh               # Manual price refresh
│   └── ...                         # Migration/fix scripts
├── data/                           # SQLite DB + WAL files (git-ignored)
├── public/uploads/                 # Uploaded files (git-ignored)
├── docs/                           # ADRs and agent docs
├── next.config.mjs                 # Next.js config
├── tailwind.config.ts              # Tailwind theme
└── package.json
```

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/stocks` | GET, POST | List all stocks (with counts) / Create a stock |
| `/api/stocks/[ticker]` | GET, PUT, DELETE | Get/update/delete a single stock |
| `/api/stocks/[ticker]/files` | GET, POST | List/upload files (auto-converts to Markdown) |
| `/api/stocks/[ticker]/files/[id]` | DELETE | Delete a single file |
| `/api/stocks/[ticker]/entries` | GET, POST | List/create research notes |
| `/api/stocks/[ticker]/entries/[id]` | PUT, DELETE | Update/delete a note |
| `/api/stocks/[ticker]/summarize` | POST | Run AI summary for one stock |
| `/api/stocks/[ticker]/relationships` | POST | Re-extract AI relationship map |
| `/api/stocks/[ticker]/verify-all` | POST | Verify all unverified claims for a stock |
| `/api/stocks/[ticker]/research-plan` | GET | AI-generated research plan |
| `/api/stocks/[ticker]/thesis-drift` | GET | Thesis drift analysis |
| `/api/summarize-all` | POST | Summarize ALL stale stocks |
| `/api/sync` | POST | Fetch CSV, parse tweets, extract claims |
| `/api/tweets` | GET | List all synced tweets |
| `/api/claims` | GET | List all claims |
| `/api/research` | POST | Run research on claims |
| `/api/research-all` | POST | Research all pending claims |
| `/api/triage` | GET | List pending triage items |
| `/api/portfolio` | GET | Portfolio-level analysis |
| `/api/concepts` | GET | Concept taxonomy |
| `/api/cleanup` | GET | Cleanup task queue |
| `/api/orchestrate` | POST | Manual orchestrator tick trigger |
| `/api/prices/refresh` | POST | Manual price refresh |
| `/api/convert-url` | POST | Convert any URL to Markdown |
| `/api/telegram/check` | GET | Manual Telegram poll |
| `/api/costs` | GET | API cost tracking |
| `/api/log` | GET | Pipeline run log |
| `/api/export` | GET | Export data as JSON |

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Stock grid with search, sector filter, "Refresh All", Tweet Sync panel |
| Stock Detail | `/stocks/[ticker]` | AI Memory block (summary), Notes, Files, Claims, Relationships tabs |
| Stock Edit | `/stocks/[ticker]/edit` | Edit stock metadata |
| Tweets | `/tweets` | All synced tweets with search, expand/collapse |
| Triage | `/triage` | Pending Telegram reviews |
| Research | `/research` | Research queue status dashboard |
| Portfolio | `/portfolio` | Cross-stock urgency + thesis drift |
| Concepts | `/concepts` | Technology/supply-chain concept taxonomy |
| Claims | `/claims` | All claims across all stocks |
| Cleanup | `/cleanup` | Review/approve cleanup tasks |
| Log | `/log` | Pipeline run observability |

## Database Schema

15 models in Prisma/SQLite:

| Model | Purpose |
|-------|---------|
| `Stock` | Tracked company (ticker, sector, AI summary, chokepoint depth, price data) |
| `File` | Uploaded document (auto-converted to Markdown for AI) |
| `Note` | User research notes (formerly "Entry") |
| `Tweet` | Serenity's tweet (deduped by SHA-256 hash) |
| `Claim` | Falsifiable statement extracted from a tweet (AI-verified status) |
| `Concept` | Technology/supply-chain/market theme tag |
| `Relationship` | AI-discovered connection (competitor, supplier, moat, gap, etc.) |
| `Decision` | Investment maturity (beginning → core → actionable) |
| `Annotation` | Human margin note on a narrative section |
| `PipelineRun` | Observability log — every pipeline stage execution |
| `PendingTask` | Persisted work queue (ADR-0001) — atomic claim, bounded retries |
| `ScheduleState` | Last-run timestamps (survives restarts) |
| `CleanupTask` | Dedup/triage cleanup suggestions for human review |
| `ApiCallLog` | LLM call cost tracking (input/output tokens, USD) |
| `TweetConcept` | Many-to-many join: Tweet ↔ Concept |

## The Agent System

Twelve autonomous agents, dispatched by the scheduler or triggered by pipeline events:

| Agent | Schedule | Responsibility |
|-------|----------|---------------|
| **Watchdog** 🐕 | Every 5 min | Scans for failed runs, stuck runs, dead tasks |
| **Ops** 🔧 | After watchdog | Auto-fixes stuck pipelines, reclaims orphaned tasks |
| **Ingest** 📥 | Hourly | Fetches tweets from Google Sheets CSV, extracts claims |
| **Price** 💹 | Daily 2 AM | Multi-source stock price + fundamentals refresh |
| **Auditor** 🔍 | Daily 3 AM | Data quality scans |
| **Editor** ✏️ | Daily 3 AM | Content quality auto-fixes |
| **Cleanup** 🧹 | Weekly Sun 4 AM | Duplicate detection, orphan cleanup |
| **Decision** 🧠 | Daily 4 AM | Deep investment thesis generation |
| **Research** 🔬 | Daily 5 AM | Stale research refresh + content coverage (Sun) |
| **Analysis** 📊 | On demand | Portfolio-level cross-stock analysis |
| **Scoring** 🎯 | On read | Multi-factor opportunity scoring (strong buy / watch / pass) |
| **Orchestrator** 🎻 | On tick | Telegram polling + task queue draining |

Agents are registered in `src/agents/` with a simple interface: `{ key, name, emoji, description, stages, run }`. The scheduler calls `getAgent(key)?.run(input)`.

## The Task Queue (ADR-0001)

All work flows through a persisted `PendingTask` queue. When data changes (tweet synced, file uploaded, summary generated), the affected module calls `enqueueTask()` instead of executing work immediately. The orchestrator's 30s tick drains due tasks:

- **Atomic claim** — tasks are claimed (`pending` → `claimed`) under a single-status filter so two ticks never run the same work.
- **Bounded retries** — 3 attempts with exponential backoff (60s → 5min → 20min). After exhausting retries, the task goes `dead` and surfaces for human review.
- **Per-task timeout** — 10-minute hard deadline per task prevents any one handler from stalling the drain.
- **Dedup** — re-enqueuing a `pending` task of the same kind+ticker (or kind+claimId) just bumps its `dueAt`; `claimed` (running) tasks are not deduped so a second run can pick up new data.
- **Chain** — summarize success → auto-enqueues extract + narrative.

## Design Decisions

1. **AI owns claim status.** The research pipeline sets `status` (supported/refuted/disputed). Humans contribute `humanNote` — observations that inform but don't override the AI's verdict.

2. **Impact-based triage.** Low-impact claims (≤3) auto-flow to research. High-impact (≥4) escalate to Telegram. Telegram is an escalation channel, not a gate — the system proceeds without human input.

3. **Single AI seam.** All LLM calls cross `src/lib/deepseek.ts` — one module, multi-provider support (DeepSeek + Z.AI GLM). Cost tracking, error handling, and JSON parsing are concentrated in one place.

4. **Files auto-converted.** PDFs, DOCXs, images, audio, HTML are converted to Markdown on upload via `markit-ai`. The AI reads Markdown; the original file is preserved for human viewing.

5. **Multi-source prices.** Stock prices come from Finnhub (primary) → Yahoo Finance → Alpha Vantage (international fundamentals), with USD normalization for cross-stock comparison.

6. **Persisted task queue.** Replaced the old in-memory EventEmitter + setTimeout pattern. Work survives process restarts. The orchestrator is the single drainer — no distributed locking needed.

7. **In-process scheduler.** Runs inside the Next.js server (via `instrumentation.ts`) rather than as a separate PM2 process. No HTTP boundary between heartbeat and brain. WAL mode enables concurrent reads from API routes during scheduler writes.

8. **Stance is parsed, not stored.** The AI summary's stance (Bullish/Bearish/Neutral) is regex-extracted from the Markdown on read — no column to get out of sync.

9. **Adversarial deep research.** `deep` mode runs two passes: one trying to confirm the claim, one trying to refute it. Agreeing verdicts are applied; disagreement marks the claim `disputed`.

## Running in Production

```bash
# Build
npm run build

# Start with PM2
pm2 start npm --name serenity -- start
pm2 save

# Or just
npm start   # Next.js production server on :3000
```

The scheduler starts automatically on boot via `instrumentation.ts`. No separate worker process needed.

### Maintenance Scripts

```bash
# Manual tweet sync
./scripts/sync-cron.sh

# Manual price refresh
./scripts/price-cron.sh

# Database backup
./scripts/backup.sh

# Seed stocks from master list
node seed-stocks.js

# Run full check suite (format + lint + types + tests)
npm run check

# Quick check (types + tests only)
npm run check:quick
```

## Development

```bash
npm run dev          # Dev server on 0.0.0.0:3000
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier
npm run typecheck    # TypeScript check
npm test             # Vitest
```
