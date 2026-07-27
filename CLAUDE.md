# Serenity Tracker

A Next.js 14 stock tracking and AI-powered research analysis app. Tracks stocks mentioned by the investor "Serenity" (@aleaboreddit), extracts claims from his tweets, and uses DeepSeek's LLM to cross-reference claims against uploaded documents.

**Before starting work, read the build log:** `.claude/projects/-root-serenity-tracker/memory/build-log.md` — complete record of every feature, bug fix, and architecture decision from June 2026 to present. Also check `MEMORY.md` in the same directory for session-specific context.

## Tech Stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript
- **Database:** SQLite via Prisma ORM (`prisma/schema.prisma`)
- **Styling:** Tailwind CSS 3 (dark theme with custom CSS variables)
- **AI:** DeepSeek Chat API (`deepseek-chat` model)
- **File conversion:** `markit-ai` CLI (converts PDF, DOCX, images, audio, HTML to Markdown)
- **PDF rendering:** `mupdf` + iframe for in-browser PDF viewing

## Database Schema (Prisma — SQLite)

6 models: `Stock`, `File`, `Entry`, `Tweet`, `Claim`, `Relationship`

- **Stock** — ticker (unique), name, sector, notes, summary (AI-generated), lastSummaryAt
- **File** — belongs to Stock; filename, originalName, fileType, fileSize, description, markdown (converted content for LLM)
- **Entry** — belongs to Stock; title, content, tag (user's research notes)
- **Tweet** — contentHash (unique, SHA-256 truncated), content, timestamp, claimCount
- **Claim** — belongs to Stock + optional Tweet; text, source, status (unverified/supported/refuted/disputed), evidence
- **Relationship** — belongs to Stock; type (competitor/partner/supplier/moat/policy/gap + AI-discovered), target (free text), description, confidence (confirmed/speculative/gap)

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/stocks` | GET, POST | List all stocks (with counts) / Create a stock |
| `/api/stocks/[ticker]` | GET, PUT, DELETE | Get/update/delete a single stock (delete also removes files from disk) |
| `/api/stocks/[ticker]/files` | GET, POST | List/upload files; POST auto-converts non-text files to Markdown via `markit` CLI |
| `/api/stocks/[ticker]/files/[id]` | DELETE | Delete a single file |
| `/api/stocks/[ticker]/entries` | GET, POST | List/create research notes |
| `/api/stocks/[ticker]/entries/[id]` | PUT, DELETE | Update/delete a note |
| `/api/stocks/[ticker]/summarize` | POST | Run AI summary for one stock (DeepSeek — gathers tweets, claims, docs, notes → structured analysis) |
| `/api/stocks/[ticker]/claims/[id]` | PUT | Update claim status (cycle: unverified→supported→refuted→disputed) and evidence |
| `/api/stocks/[ticker]/relationships` | POST | Re-extract AI relationship map for a stock (manual trigger) |
| `/api/summarize-all` | POST | Summarize ALL stocks that have new data since last summary |
| `/api/sync` | POST | Fetch CSV from Google Sheets, parse tweets, dedup by content hash, extract tickers+claims via DeepSeek, auto-create stocks |
| `/api/convert-url` | POST | Convert any URL to Markdown via `markit` CLI |
| `/api/tweets` | GET | List all synced tweets |

## Pages

- **`/` (Home)** — Stock grid with search, sector filter, "Refresh All" (summarize-all), Tweet Sync panel (CSV URL input + sync button)
- **`/stocks/[ticker]`** — Stock detail page:
  - **AI Memory block** — shows AI summary (Markdown rendered), "Run Summary" button (disabled when up-to-date)
  - **General Notes** — stock-level notes
  - **Tabs:** All (timeline), Files (drag-and-drop upload, URL paste→convert, inline PDF/image preview), Notes (CRUD with tags), Claims (status cycling, evidence editing)
- **`/tweets`** — List all synced tweets with search, expand/collapse for long tweets

## Key Architecture Decisions

1. **Files are auto-converted to Markdown on upload** using `markit-ai` CLI. Original file is preserved in `public/uploads/[ticker]/`, converted markdown stored in DB for LLM consumption. Non-convertible files show "not indexed" badge.
2. **Summary freshness detection** — compares `lastSummaryAt` against the newest file/entry/claim/relationship creation date. "Run Summary" button is disabled when up-to-date.
3. **Claim lifecycle** — claims start "unverified", user cycles through supported→refuted→disputed with one click. Evidence field supports free-text notes/links.
4. **Tweet dedup** — SHA-256 hash of content (first 16 chars) prevents re-processing the same tweet.
5. **LLM prompt engineering** — The summary prompt instructs DeepSeek to be a "skeptical analyst" working for the user, treating Serenity's tweets as low-reliability opinions and uploaded documents as high-reliability evidence. Output format is structured: Stance, Confidence, Verdict, Supported/Unverified/Contradicted claims, Key Numbers, Gaps, Bottom Line.
6. **Stance parsing** — regex extracts Bullish/Bearish/Neutral from `**Current Stance:** ...` or `**Stance:** ...` in summaries.
7. **CSS variables** — custom dark theme (`--bg`, `--fg`, `--surface`, `--border`, `--muted`, `--accent`) defined in `globals.css`. No CSS framework dependency beyond Tailwind.
8. **DeepSeek client module** (`src/lib/deepseek.ts`) — single `chat()` and `chatJson()` interface for all LLM calls. Auth, error handling, and JSON parsing concentrated in one place. 3 former copy-pasted fetch sites now cross the same seam.
9. **Relationship extraction** — separate LLM call with seeded discovery prompt (competitor, partner, supplier, moat, policy, gap + AI expansion). Full context (tweets, claims, concepts, documents, notes) fed to the AI. Output confidence-labeled: confirmed (solid), speculative (dashed), gap (dotted).
10. **Auto-extraction triggers** — relationships re-extracted on every data change: tweet sync, file upload, summarize (single or batch), claim status/evidence update. Manual "Re-map" button on stock page as fallback.

## Running the App

```bash
npm run dev      # Next.js dev server on 0.0.0.0:3000
npm run build    # Production build
npm start        # Production start
```

Requires `.env` with:
- `DATABASE_URL="file:./data/serenity.db"` (SQLite path)
- `DEEPSEEK_API_KEY=...` (for AI summarization and tweet claim extraction)

Seed script: `node seed-stocks.js` — populates ~100 stocks from a curated master list across US, Japan, Taiwan, Korea, Europe, Hong Kong markets. Also reports orphan stocks in DB not in master list.

## Important Notes

- The `markit-ai` and `mupdf` packages are marked as `serverExternalPackages` in `next.config.mjs` — they cannot be bundled.
- File uploads go to `public/uploads/[ticker]/` — this directory is git-ignored (already in `.gitignore` via wildcard).
- The SQLite database lives in `prisma/data/` or `data/` (both git-ignored).
- The app is designed for single-user local use — no auth, no multi-tenancy.
- Currently configured to hit DeepSeek API; the prompt and model can be changed in the summarize and sync routes.
