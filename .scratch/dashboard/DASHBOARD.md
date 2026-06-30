# Dashboard progress log

## 2026-06-30 — Domain modeling session (grill-with-docs)

### Decisions made (domain grilling)

1. **CONTEXT.md** — created domain glossary with all 9 entities, confidence terms, verification pipeline, synonyms
2. **Entry → Note** — renamed everywhere (schema, API, code, UI already matched)
3. **Relationship section** — "map" → "known", tab "Map" → "Relationships"
4. **Confidence disambiguation** — extractionConfidence (1-5), verificationConfidence (high/med/low), sourceConfidence (confirmed/speculative/gap)
5. **Shared types** — extract to `src/lib/types.ts` (deferred)
6. **Relationship.type** — tagged approach: 6 known types + "other" fallback (deferred)
7. **Claim status vs verdict** — kept separate by design, "unresolved" is verdict-only
8. **Decision naming** — "Maturity Ladder" → "Decisions" in UI

### What we built this session

| # | Change | Files touched |
|---|--------|---------------|
| 1 | CONTEXT.md glossary | 1 new file |
| 2 | Entry → Note rename | 22 files (schema, API dirs, lib, pages) |
| 3 | section "map" → "known" | schema, relationships.ts, page.tsx |
| 4 | Tab "Map" → "Relationships" | page.tsx |
| 5 | Confidence prefixing (3 fields) | schema, verify.ts, relationships.ts, sync route, 5 page components |
| 6 | "Maturity Ladder" → "Decisions" | portfolio/page.tsx |
| 7 | PriceChart (TradingView widget) | new file, BottomLine merged with stance info |
| 8 | vitest env fix | vitest.config.ts |

### Stale items (not yet built)

- [ ] Shared types → `src/lib/types.ts`
- [ ] Relationship.type tagged approach (badges for 6 known types + other)
- [ ] ClaimHealth labels: "verified" → "supported" (these are aggregate labels, not status values — lower priority)
- [ ] Source quality filter for verification (Exa domain scoring)
- [ ] Spot-check dashboard for extraction QA
- [ ] Mind map visualization for relationships

### Current state

- TypeScript: clean
- Lint: 0 errors, 1 warning (img element)
- Tests: 26/26 passing
- Format: all files formatted
- DB: schema pushed, fresh

## 2026-06-30 — Quality infrastructure session (morning)

### Decisions made (grilling session)

1. App path: **B** — personal tool with durability (not multi-user, not throwaway)
2. Testing: **smoke + unit** — sweet spot for confidence vs effort
3. Data failure priorities: pipeline breakage → extraction accuracy → verification quality → data loss
4. Pipeline detection: **API smoke tests + DB freshness checks**
5. Verification: **multi-source corroboration** first, source quality scoring second
6. Extraction: **LLM self-confidence scoring** first, spot-check dashboard second
7. Linting: **ESLint + eslint-config-next + Prettier** (no pre-commit hooks)
8. Check command: **manual only** — `npm run check`, no automation
9. Backup: **automated** — daily cron to private GitHub repo (tier B: code + DB)
10. Scratch: **tracked in git** — session notes as free memory

### What we built

| # | Feature | Commit |
|---|---------|--------|
| 1 | Automated DB backup + .env.example | `8f22aef` |
| 2 | ESLint + Prettier + format/lint scripts | `fc083fd` |
| 3 | Multi-source corroboration for verify | `cbaf3c5` |
| 4 | LLM self-confidence scoring for extraction | `5728311` |
| 5 | Vitest test suite (26 tests) | `d2caae2` |
| 6 | DB freshness check script | `6fb8310` |
| 7 | `npm run check` command + tracked .scratch/ | `6fb8310` |

### Files changed

```
NEW:
  .env.example
  .eslintrc.json
  .prettierrc
  .prettierignore
  vitest.config.ts
  scripts/backup.sh
  scripts/check-freshness.ts
  src/__tests__/db.test.ts
  src/__tests__/api-smoke.test.ts

MODIFIED:
  .gitignore                         (+ data/* exception for tracker.db)
  package.json                       (+ lint, format, typecheck, test, check scripts)
  prisma/schema.prisma               (+ confidence on Claim)
  src/lib/db.ts                      (fixed parseStance regex)
  src/lib/verify.ts                  (+ corroboratingSources, multi-source prompt)
  src/app/api/sync/route.ts          (+ confidence scoring in extraction prompt)
  src/app/api/stocks/[ticker]/claims/[id]/verify/route.ts   (+ source count in evidence)
  src/app/api/stocks/[ticker]/verify-all/route.ts           (+ source count in evidence)
  src/app/stocks/[ticker]/page.tsx    (+ low-conf badge)
  src/app/claims/ClaimsContent.tsx    (+ low-conf badge)
  CHANGELOG.md                       (2026-06-30 entry)
```

### Freshness check findings (from initial run)

- ✅ Tweet freshness — 0 days old (pipeline flowing)
- ⚠️ 59/141 stocks have claims but no AI summary
- ⚠️ 1 stock has new claims since last summary (3231.TW)
- ⚠️ 125 claims stuck unverified for 7+ days
- ❌ 3 stocks have extraction errors (MU, ...)
- ✅ No low-confidence claims (not yet scored — needs re-sync)

### New development loop

```bash
npm run check:quick   # 30 seconds — before stepping away
npm run check         # full check — before pushing
npm run format        # auto-format everything
npm test              # run tests once
npm run test:watch    # watch mode
```

Backup runs daily at 7:13am automatically.

### What's NOT built yet (stale items from previous session)

- [ ] **Portfolio action layer** (B→C→A maturity ladder) — buy/hold/sell decisions
- [ ] **Spot-check dashboard** — random claim sample vs original tweet for extraction QA
- [ ] **Source quality filter** — prefer .gov/.edu/established financial domains in verification
- [ ] **Cross-stock portfolio dashboard** — "which stocks need attention right now?"
- [ ] **Thesis drift detection** — eroding theses based on verified/refuted claims

### Environment

- `.env`: `DATABASE_URL`, `DEEPSEEK_API_KEY`, `EXA_API_KEY`
- Dev server: `npm run dev` on port 3000
- DB: SQLite at `data/tracker.db` (1.8 MB, git-tracked)
- Tests: 26 passing, 0 failing
- Lint: 0 errors, 1 warning (img element in page.tsx)
- TypeScript: clean

### Resume instructions

```bash
cd /root/serenity-tracker
npm run dev          # starts on port 3000
npm run check:quick  # verify everything is healthy
```

Open `http://localhost:3000` — home page with stock grid.
