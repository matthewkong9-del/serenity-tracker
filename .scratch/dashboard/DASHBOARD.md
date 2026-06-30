# Dashboard progress log

## 2026-06-30 — Final state

### Session summary

Two grilling sessions today: quality infrastructure (morning) + domain modeling (afternoon).

### What was built today

| # | Feature | Commit |
|---|---------|--------|
| 1 | Automated DB backup (daily cron) + .env.example | `8f22aef` |
| 2 | ESLint + Prettier + format/lint/typecheck scripts | `fc083fd` |
| 3 | Multi-source corroboration for claim verification | `cbaf3c5` |
| 4 | LLM self-confidence scoring for claim extraction | `5728311` |
| 5 | Vitest test suite (26 tests: 19 unit + 7 API smoke) | `d2caae2` |
| 6 | DB freshness check script (6 diagnostic queries) | `6fb8310` |
| 7 | `npm run check` command + tracked .scratch/ | `6fb8310` |
| 8 | Price chart (TradingView widget) replaces StanceCard | `82b2d2c` |
| 9 | Bug fix: null type/target in relationship extraction | `a56ae10` |
| 10 | CONTEXT.md domain glossary | `1b84d73` |
| 11 | Entry → Note rename (22 files) | `8343df3` |
| 12 | Confidence disambiguation (3 renamed concepts) | `8343df3` |
| 13 | Relationship section "map" → "known" + tab labels | `8343df3` |
| 14 | Fix: dotenv in freshness check | `ca85f5d` |
| 15 | Fix: next.config.mjs for Next.js 14.2 | `9d78648` |

### Domain decisions (grill-with-docs)

1. **CONTEXT.md** — domain glossary with all entities, confidence terms, renamed terms
2. **Entry → Note** — renamed everywhere. `Stock.notes` (String) → `Stock.generalNotes`
3. **Confidence** → `extractionConfidence` (Claim, 1-5), `verificationConfidence` (Verdict), `sourceConfidence` (Relationship)
4. **Relationship section** `"map"` → `"known"`, tab `"Map"` → `"Relationships"`
5. **Shared types** → extract to `src/lib/types.ts` (deferred)
6. **Relationship.type** → tagged approach: 6 known types + "other" (deferred)
7. **Claim status vs verification verdict** — kept separate by design
8. **Decision** — UI `"Maturity Ladder"` → `"Decisions"`
9. **Testing** — smoke + unit, manual `npm run check`, no pre-commit hooks
10. **Backup** — tier B (code + DB) to private GitHub repo, daily cron

### Current pipeline health

```
format:check  ✅ All matched files use Prettier code style!
lint          ✅ 0 errors, 1 warning (img element)
typecheck     ✅ clean
tests         ✅ 26/26 passing
freshness     ✅ 0 errors, 3 warnings (59 unsummarized, 1 stale, 122 stuck claims)
build         ✅ 35 routes compiled successfully
dev server    ✅ starts clean, no warnings
```

### Stale items (not yet built)

- [ ] Shared types → `src/lib/types.ts`
- [ ] Relationship.type tagged approach (badges for known types + other)
- [ ] Source quality filter for verification (Exa domain scoring)
- [ ] Spot-check dashboard for extraction QA
- [ ] Mind map visualization for relationships
- [ ] Portfolio action layer (B→C→A maturity decisions)
- [ ] Batch verification ("Verify All Unverified" across all stocks)
- [ ] Cross-stock portfolio dashboard
- [ ] Thesis drift detection

### Development loop

```bash
npm run check:quick   # 30 seconds — typecheck + tests
npm run check         # full check — format + lint + typecheck + tests + DB freshness
npm run format        # auto-format everything
npm test              # run tests once
npm run test:watch    # watch mode
npm run dev           # start dev server
```

Backup runs daily at 7:13am automatically.

### Resume instructions

```bash
cd /root/serenity-tracker
npm run dev          # starts Next.js dev server
npm run check:quick  # verify everything is healthy
```
