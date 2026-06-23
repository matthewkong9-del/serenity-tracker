# Changelog

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
