/**
 * Serenity Pipeline Orchestrator — the heartbeat that keeps all 9 agents running.
 *
 * Schedule:
 *   Every 30s    → orchestrate tick (research + summarize) + watchdog scan
 *   Every 5 min  → watchdog deep scan
 *   Every hour   → ingest check (tweet sync if SYNC_CSV_URL configured)
 *   Daily 2 AM   → price refresh + auditor scan
 *   Weekly Sun 3AM → cleanup scan
 *
 * Usage:
 *   pm2 start scripts/orchestrator.js --name serenity-orchestrator
 *   pm2 save
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env"), quiet: true });

const BASE_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3000";
const TICK_INTERVAL_MS = parseInt(process.env.ORCHESTRATOR_INTERVAL || "30000", 10); // 30s
const TOKEN = process.env.ORCHESTRATOR_TOKEN || "";

// ── Last-run tracking (in-memory, resets on PM2 restart) ────────────

const lastRun = {
  watchdogDeep: 0,    // timestamp of last deep watchdog scan
  ops: 0,             // timestamp of last ops fixer run
  ingest: 0,          // timestamp of last ingest check
  price: 0,           // timestamp of last price refresh
  auditor: 0,         // timestamp of last auditor scan
  editor: 0,          // timestamp of last editor fixer run
  cleanup: 0,         // timestamp of last cleanup
};

// ── Helpers ──────────────────────────────────────────────────────────

/** Fetch with an AbortController timeout so a hung request doesn't block
 *  the orchestrator tick loop forever. */
async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Call the main orchestrate endpoint directly (uses token auth). */
async function orchestrateTick() {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/orchestrate`, {
      method: "POST",
      headers: { "x-orchestrator-token": TOKEN },
    }, 25000);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, ...data };
  } catch (e) {
    console.error(`[orchestrator] tick failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

/** Trigger a named agent via the agents trigger endpoint. */
async function triggerAgent(agentName, label) {
  try {
    const res = await fetchWithTimeout(`${BASE_URL}/api/agents/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: agentName }),
    }, 55000);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, ...data };
  } catch (e) {
    console.error(`[orchestrator] ${label} failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

function shouldRun(key, intervalMs) {
  return Date.now() - lastRun[key] >= intervalMs;
}

/** Check if we're in the right hour window for a daily job.
 *  @param {number} hour - UTC hour to run at (e.g., 2 for 2 AM UTC)
 *  @param {string} key - lastRun key for cooldown tracking */
function isHourWindow(hour, key) {
  const now = new Date();
  return now.getUTCHours() === hour && shouldRun(key, 23 * 60 * 60 * 1000);
  // "shouldRun" ensures we only fire once per day (23h cooldown)
}

/** Check if it's Sunday in UTC */
function isSunday() {
  return new Date().getUTCDay() === 0;
}

// ── Main tick ────────────────────────────────────────────────────────

let running = false;

async function tick() {
  if (running) {
    console.log("[orchestrator] previous tick still running, skipping");
    return;
  }
  running = true;

  try {
    // ── 1. Core orchestration tick (every 30s) ──────────────────────
    const orch = await orchestrateTick();
    if (orch.workDone) {
      console.log(`[orchestrator] ${orch.summary}`);
    }

    // ── 2. Watchdog + Ops: scan + fix every 5 min ──────────────────
    if (shouldRun("watchdogDeep", 5 * 60 * 1000)) {
      lastRun.watchdogDeep = Date.now();
      const wd = await triggerAgent("watchdog", "watchdog:scan");
      if (wd.issues?.length > 0) {
        console.log(`[orchestrator] 🐕 watchdog: ${wd.message}`);
        // If watchdog found issues, run Ops immediately to fix them
        lastRun.ops = Date.now();
        const op = await triggerAgent("ops", "ops:fix");
        console.log(`[orchestrator] 🔧 ops: ${op.message || op.error || "triggered"}`);
      }
    }

    // ── 3. Ingest: hourly tweet sync ──────────────────────────────
    const syncUrl = process.env.SYNC_CSV_URL;
    if (syncUrl && shouldRun("ingest", 60 * 60 * 1000)) {
      lastRun.ingest = Date.now();
      const ing = await triggerAgent("ingest", "ingest:sync");
      console.log(`[orchestrator] 📥 ingest: ${ing.message || ing.error || "triggered"}`);
    }

    // ── 4. Price refresh: daily at 2 AM UTC ───────────────────────
    if (isHourWindow(2, "price")) {
      lastRun.price = Date.now();
      const pr = await triggerAgent("price", "price:refresh");
      console.log(`[orchestrator] 💹 price refresh: ${pr.message || pr.error || "triggered"}`);
    }

    // ── 5. Auditor + Editor: scan + fix daily at 3 AM UTC ──────────
    if (isHourWindow(3, "auditor")) {
      lastRun.auditor = Date.now();
      const au = await triggerAgent("auditor", "auditor:scan");
      console.log(`[orchestrator] 🔍 auditor: ${au.message || au.error || "triggered"}`);
      // Editor runs right after to fix content issues found
      lastRun.editor = Date.now();
      const ed = await triggerAgent("editor", "editor:fix");
      console.log(`[orchestrator] ✏️ editor: ${ed.message || ed.error || "triggered"}`);
    }

    // ── 6. Cleanup: weekly Sunday at 4 AM UTC ─────────────────────
    if (isHourWindow(4, "cleanup") && isSunday()) {
      lastRun.cleanup = Date.now();
      const cl = await triggerAgent("cleanup", "cleanup:scan");
      console.log(`[orchestrator] 🧹 cleanup: ${cl.message || cl.error || "triggered"}`);
    }

  } catch (e) {
    console.error(`[orchestrator] tick crashed: ${e.message}`);
  } finally {
    running = false;
  }
}

// ── Start ────────────────────────────────────────────────────────────

console.log(`[orchestrator] starting — tick every ${TICK_INTERVAL_MS / 1000}s, base=${BASE_URL}`);
console.log(`[orchestrator] schedule: watchdog+ops(5m) ingest(1h) price(2AM) auditor+editor(3AM) cleanup(Sun 4AM)`);
tick();
setInterval(tick, TICK_INTERVAL_MS);
