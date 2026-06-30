# Dashboard progress log

## 2026-06-29 — Session checkpoint (end of session)

### Decisions made

1. **"Overview" tab** — new default tab on stock page, replaces standalone AI Memory block
2. **AI Memory block** — moves INTO Overview (StanceCard + BottomLine sections)
3. **General Notes** — moved into Notes tab
4. **Clickable claim health pills** — tapping e.g. "18 unverified" jumps to Claims tab filtered to that status
5. **AI-ranked research priorities** — DeepSeek ranks unverified claims by "most impactful to verify"
6. **$0 verification pipeline** — Exa search (20K/mo free) + DeepSeek for claim verification (was Firecrawl)
7. **Firecrawl CLI skills** — 31 skills for Claude Code (separate from app pipeline)
8. **Extraction errors** — persisted to DB, shown in Map tab with dismiss button

### Architecture built this session

| Layer | What | Files |
|-------|------|-------|
| Verification pipeline | Exa search → DeepSeek → verdict | `src/lib/verify.ts` |
| Verify API route | `POST /api/stocks/[ticker]/claims/[id]/verify` | `src/app/api/stocks/[ticker]/claims/[id]/verify/route.ts` |
| Verify UI | "🔍 Verify" button on claims (detail + dashboard) | `page.tsx`, `ClaimsContent.tsx` |
| Extraction errors | Errors persisted to DB, shown in Map tab | `prisma/schema.prisma`, `src/lib/relationships.ts`, 6 routes |
| Overview tab | 7 section components + rank-claims API | `Overview/*.tsx`, `rank-claims/route.ts`, `summarize.ts` |
| Rank claims | DeepSeek prioritizes unverified claims by impact | `src/lib/summarize.ts` (rankClaimsByImportance) |
| Free stack | Exa + DeepSeek = $0/verification | `.env` |

### Data flow

```
Claim Verification:
  Claim → Exa /search (free, 20K/mo) → full page text → DeepSeek → verdict + evidence → claim updated

Research Priorities:
  Overview tab opens → POST /api/stocks/[ticker]/rank-claims → DeepSeek ranks unverified claims → top 5 shown

Extraction Errors:
  Any mutation → runExtractions() → DB extractionError field → Map tab red banner → ✕ Dismiss
```

### File inventory

```
NEW:
  src/lib/verify.ts
  src/app/api/stocks/[ticker]/claims/[id]/verify/route.ts
  src/app/api/stocks/[ticker]/rank-claims/route.ts
  src/app/stocks/[ticker]/Overview/StanceCard.tsx
  src/app/stocks/[ticker]/Overview/ClaimHealth.tsx
  src/app/stocks/[ticker]/Overview/ResearchPriorities.tsx
  src/app/stocks/[ticker]/Overview/KeyRelationships.tsx
  src/app/stocks/[ticker]/Overview/ContrarianAngles.tsx
  src/app/stocks/[ticker]/Overview/BottomLine.tsx
  src/app/stocks/[ticker]/Overview/RecentActivity.tsx
  src/app/stocks/[ticker]/Overview/index.ts

MODIFIED:
  prisma/schema.prisma (+ extractionError)
  src/lib/summarize.ts (+ rankClaimsByImportance, now imports chatJson)
  src/lib/relationships.ts (+ runExtractions helper)
  src/app/api/stocks/[ticker]/files/route.ts (uses runExtractions)
  src/app/api/stocks/[ticker]/summarize/route.ts (uses runExtractions)
  src/app/api/stocks/[ticker]/claims/[id]/route.ts (uses runExtractions)
  src/app/api/summarize-all/route.ts (uses runExtractions)
  src/app/api/sync/route.ts (uses runExtractions)
  src/app/api/stocks/[ticker]/relationships/route.ts (+ DELETE for dismiss)
  src/app/stocks/[ticker]/page.tsx (Overview tab, statusFilter, moved blocks, Verify buttons)
  src/app/claims/ClaimsContent.tsx (+ Verify button)
  .env (EXA_API_KEY, FIRECRAWL_API_KEY)
```

### What's NOT built yet (next session)

- [ ] **Portfolio action layer** (A in B→C→A maturity ladder) — buy/hold/sell decisions across all tracked stocks
- [ ] **Batch verification** — "Verify All Unverified" for a single stock
- [ ] **Cross-stock portfolio dashboard** — "which of my 137 stocks need attention right now?"
- [ ] **Thesis drift detection** — if the original bull thesis is eroding based on newly verified/refuted claims

### Environment

- `.env`: `DATABASE_URL`, `DEEPSEEK_API_KEY`, `EXA_API_KEY`, `FIRECRAWL_API_KEY` (CLI skills only)
- Dev server: `npm run dev` on port 3000
- DB: SQLite at `data/tracker.db`
- TypeScript: clean compile (`npx tsc --noEmit` passes)

### Resume instructions

```bash
cd /root/serenity-tracker
npm run dev          # starts on port 3000
```

Open `http://localhost:3000/stocks/LPKF` — Overview tab loads by default with all 7 sections.
