# Changelog

## 2026-06-24 — Claims Dashboard

### Concepts Knowledge Base (`/concepts`)
- New `Concept` and `TweetConcept` models — auto-extracted from tweets during sync
- DeepSeek extracts technologies, supply chain dynamics, market themes, and products
- `/concepts` page: grouped by category, click to expand showing source tweets
- Category filter tabs with counts (Technology, Supply Chain, Market Theme, Product, etc.)
- Backfill endpoint (`POST /api/backfill-concepts`) reprocesses existing tweets
- 201 concepts extracted from 62 tweets across 7 categories
- New API: `GET /api/concepts` with category filtering

### Claims Dashboard Page (`/claims`)
- Global claims view across all stocks with stats summary bar
- Status filter tabs: All, Unverified, Supported, Refuted, Disputed (with live counts)
- Full-text search across claim text, evidence, source, ticker, company name
- Sort by newest/oldest
- Inline status cycling and evidence editing (same UX as stock detail page)
- Source tweet preview embedded in each claim card (expandable)
- Tweet filter support via `/claims?tweetId=X` query param
- New API: `GET /api/claims` with filtering by status, search, tweetId, sort

### Tweet-Claim Linking
- Claim count badges on `/tweets` page are now clickable links → `/claims?tweetId=X`

### Navigation
- Added "Claims" link in top nav bar

### Fixes
- Fixed DATABASE_URL path resolution (Prisma resolves relative to prisma/ directory)

## 2026-06-23 — Initial Build

### Stock Management
- Stock CRUD with SQLite/Prisma (create, read, update, delete with file cleanup)
- ~100 pre-seeded stocks across US, Japan, Taiwan, Korea, Europe, Hong Kong
- Stock grid homepage with search and sector filtering
- Stock detail page with All/Files/Notes/Claims tabs

### Tweet Sync
- Google Sheets CSV ingestion with custom parser
- SHA-256 content deduplication
- DeepSeek LLM extraction of tickers and falsifiable claims
- Auto-creation of new Stock records from discovered tickers

### File System
- Drag-and-drop file upload with auto Markdown conversion (PDF, DOCX, images, audio, HTML, spreadsheets)
- URL-to-Markdown conversion and save
- Inline PDF/image preview
- AI-ready / not-indexed status badges

### AI Summarization
- Single-stock and batch summarize-all endpoints
- DeepSeek-powered analysis: stance, confidence, verdict, claim cross-referencing
- Freshness detection (compares lastSummaryAt against data timestamps)

### Claim Verification
- Four-status workflow: unverified → supported → refuted → disputed
- Evidence field with free-text notes
- Claims tab with status breakdown

### Research Notes
- Per-stock notes with title, content, and tag
- Tag autocomplete, full CRUD

### UI
- Custom dark theme with CSS variables
- Responsive grid, sticky nav, timeline view
- Status badges, toast messages
