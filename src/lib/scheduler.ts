/**
 * In-process scheduler — replaces scripts/orchestrator.js.
 *
 * Started by instrumentation.ts on server boot. Calls orchestrator module
 * functions directly — no HTTP, no token auth, no second process.
 *
 * Schedule:
 *   Every 30s    → orchestratorTick() + periodic agent triggers
 *   Every 5 min  → watchdog + ops scan + fix
 *   Every 1h     → ingest (tweet sync)
 *   Daily 2 AM   → price refresh
 *   Daily 3 AM   → auditor + editor scan + fix
 *   Weekly Sun 4AM → cleanup
 */

import {
  orchestratorTick,
  shouldRun,
  isHourWindow,
  isSunday,
  initSchedule,
  markRun,
} from "@/lib/orchestrator";
import { getAgent } from "@/agents";

// ── In-memory state (on globalThis for cross-bundle sharing) ──────────

// Next.js bundles instrumentation.ts and API routes into separate chunks,
// so module-level variables aren't shared. We stash state on globalThis so
// the status/pause routes can read/write the scheduler started by instrumentation.

const __s = ((globalThis as any).__scheduler ??= {
  paused: false,
  running: false,
  intervalId: null as ReturnType<typeof setInterval> | null,
});

const TICK_INTERVAL_MS = parseInt(
  process.env.ORCHESTRATOR_INTERVAL || "30000",
  10
);

// ── Main tick ──────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  if (__s.running) {
    console.log("[scheduler] previous tick still running, skipping");
    return;
  }
  __s.running = true;

  try {
    // ── 1. Core orchestration tick (every 30s) ────────────────────
    const orch = await orchestratorTick();
    if (orch.workDone) {
      console.log(`[scheduler] ${orch.summary}`);
    }

    // ── 2. Watchdog + Ops: scan + fix every 5 min ─────────────────
    if (shouldRun("watchdogDeep", 5 * 60 * 1000)) {
      await markRun("watchdogDeep");
      const wd = await getAgent("watchdog")?.run();
      const wdIssues = wd?.issues as string[] | undefined;
      if (wdIssues && wdIssues.length > 0) {
        console.log(`[scheduler] 🐕 watchdog: ${wd?.message}`);
        await markRun("ops");
        const op = await getAgent("ops")?.run();
        console.log(`[scheduler] 🔧 ops: ${op?.message || "triggered"}`);
      }
    }

    // ── 3. Ingest: hourly tweet sync ──────────────────────────────
    const syncUrl = process.env.SYNC_CSV_URL;
    if (syncUrl && shouldRun("ingest", 60 * 60 * 1000)) {
      await markRun("ingest");
      const ing = await getAgent("ingest")?.run();
      console.log(`[scheduler] 📥 ingest: ${ing?.message || "triggered"}`);
    }

    // ── 4. Price refresh: daily at 2 AM UTC ───────────────────────
    if (isHourWindow(2, "price")) {
      await markRun("price");
      const pr = await getAgent("price")?.run();
      console.log(`[scheduler] 💹 price: ${pr?.message || "triggered"}`);
    }

    // ── 5. Auditor + Editor: scan + fix daily at 3 AM UTC ─────────
    if (isHourWindow(3, "auditor")) {
      await markRun("auditor");
      const au = await getAgent("auditor")?.run();
      console.log(`[scheduler] 🔍 auditor: ${au?.message || "triggered"}`);
      await markRun("editor");
      const ed = await getAgent("editor")?.run();
      console.log(`[scheduler] ✏️ editor: ${ed?.message || "triggered"}`);
    }

    // ── 6. Cleanup: weekly Sunday at 4 AM UTC ─────────────────────
    if (isHourWindow(4, "cleanup") && isSunday()) {
      await markRun("cleanup");
      const cl = await getAgent("cleanup")?.run();
      console.log(`[scheduler] 🧹 cleanup: ${cl?.message || "triggered"}`);
    }

    // ── 7. Decision: daily at 4 AM UTC (deep thesis generation) ──
    if (isHourWindow(4, "decision")) {
      await markRun("decision");
      const dc = await getAgent("decision")?.run();
      console.log(`[scheduler] 🧠 decision: ${dc?.message || "triggered"}`);
    }
  } catch (e: any) {
    console.error(`[scheduler] tick crashed: ${e.message}`);
  } finally {
    __s.running = false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────

/** Start the in-process scheduler. Called by instrumentation.ts on server boot. */
export async function startScheduler(): Promise<void> {
  if (__s.intervalId) return; // already running

  // Load persisted last-run timestamps so daily jobs don't double-run after
  // a restart inside their hour window.
  await initSchedule();

  console.log(
    `[scheduler] starting — tick every ${TICK_INTERVAL_MS / 1000}s`
  );
  console.log(
    `[scheduler] schedule: watchdog+ops(5m) ingest(1h) price(2AM) auditor+editor(3AM) decision(4AM) cleanup(Sun 4AM)`
  );

  // Run one tick immediately, then every TICK_INTERVAL_MS
  tick();
  __s.intervalId = setInterval(() => {
    if (!__s.paused) {
      tick();
    }
  }, TICK_INTERVAL_MS);

  // Graceful shutdown: clear interval on SIGTERM/SIGINT so the process
  // can exit cleanly (PM2 sends SIGTERM on restart/stop).
  const shutdown = () => {
    if (__s.intervalId) {
      clearInterval(__s.intervalId);
      __s.intervalId = null;
      console.log("[scheduler] stopped (shutdown)");
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

/** Stop the in-process scheduler. */
export function stopScheduler(): void {
  if (__s.intervalId) {
    clearInterval(__s.intervalId);
    __s.intervalId = null;
    console.log("[scheduler] stopped");
  }
}

/** Check if the scheduler is currently running (not paused). */
export function isSchedulerRunning(): boolean {
  return __s.intervalId !== null && !__s.paused;
}

/** Pause the scheduler (ticks stop, but the process stays alive). */
export function pauseScheduler(): void {
  __s.paused = true;
  console.log("[scheduler] paused");
}

/** Resume a paused scheduler. */
export function resumeScheduler(): void {
  __s.paused = false;
  console.log("[scheduler] resumed");
}

/** Check if the scheduler is paused. */
export function isSchedulerPaused(): boolean {
  return __s.paused;
}
