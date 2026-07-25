/**
 * Serenity Pipeline Orchestrator
 *
 * Lightweight PM2-managed process that polls the orchestrate API endpoint.
 * All logic lives in /api/orchestrate — this is just the heartbeat.
 *
 * Usage:
 *   pm2 start scripts/orchestrator.js --name serenity-orchestrator
 *   pm2 save
 */

const BASE_URL = process.env.ORCHESTRATOR_URL || "http://localhost:3000";
const TICK_INTERVAL_MS = parseInt(process.env.ORCHESTRATOR_INTERVAL || "30000", 10); // 30s default

let running = false;

async function tick() {
  if (running) {
    console.log("[orchestrator] previous tick still running, skipping");
    return;
  }
  running = true;
  try {
    const res = await fetch(`${BASE_URL}/api/orchestrate`, {
      method: "POST",
      headers: { "x-orchestrator-token": process.env.ORCHESTRATOR_TOKEN || "" },
    });
    const data = await res.json();
    if (data.workDone) {
      console.log(`[orchestrator] ${data.summary}`);
    }
  } catch (e) {
    console.error(`[orchestrator] tick failed: ${e.message}`);
  } finally {
    running = false;
  }
}

// Run immediately on start, then on interval
console.log(`[orchestrator] starting — tick every ${TICK_INTERVAL_MS / 1000}s, base=${BASE_URL}`);
tick();
setInterval(tick, TICK_INTERVAL_MS);
