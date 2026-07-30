# Event-driven reactivity with persisted triggers

Re-analyzing a stock after a claim is researched is driven by **events** (`claim:researched`), not by polling. The orchestrator's 30s tick is demoted to a **catch-up safety net** that drains a persisted pending-work table — it no longer uses `stock.updatedAt` as a reactivity signal. Pending work and "last ran" timestamps live in the DB so they survive process restarts (the app has restarted 132× under PM2).

## Considered options

- **Polling-only** — kill the event system; the 30s timer is the only trigger. Rejected: always-delayed reactivity, and the timer must notice the change.
- **Keep both, dedupe** — leave both triggers, add a "summary already pending" guard. Rejected: two systems still running, harder to reason about.
- **In-memory events** — current state. Rejected: pending work is lost on restart.
- **Redis/BullMQ queue** — durable + scalable. Rejected: adds infra to manage for a single-user app.

## Consequences

- `researchClaim` **stops touching `stock.updatedAt`** as a reactivity signal (`updatedAt` keeps its honest meaning: "the record changed"). It calls `enqueueTask({ kind:"summarize", … })` directly.
- **`src/lib/events.ts` was deleted** — the in-memory EventEmitter + `setTimeout` debounce is gone. Callers `enqueueTask(...)` directly; the row *is* the decoupled interface.
- A **`PendingTask`** table holds all queued async work — `research` | `summarize` | `extract` | `narrative` — with `attempts`, `dueAt`, and a `dead` terminal state. The 30s tick drains it via `drainPendingTasks()`, which takes **injected handlers** (no import cycles; testable with fakes, like `market-data.ts`).
- The drain **atomically claims** due tasks, so no two ticks run the same stock's work — this killed the concurrent `summarize`/`relationship` collisions that caused the watchdog→ops timeout loop.
- **Bounded retries**: a failing task retries 3× with backoff (30s→2min→10min), then dead-letters. A dead *research* task marks its claim `researchStatus="dead"`.
- `lastRun` cooldowns for daily jobs moved from an in-memory map to a **`ScheduleState`** table, so a restart inside a job's hour window can't fire it twice.
- **`ops`** no longer blanket-resets `failed→pending`; it re-queues only orphaned failed claims (no pending task) and reclaims `claimed` tasks orphaned by a restart (>5 min).
- `ScheduleState` + `PendingTask` are the only new tables; `Claim.humanNote` and `Stock.peRatio/week52High/week52Low` were added in the same `db push`.

Status: **implemented** (2026-07-30). Verified: watchdog timeout loop stopped, 409 spam stopped, queue drains, 0 dead tasks.
