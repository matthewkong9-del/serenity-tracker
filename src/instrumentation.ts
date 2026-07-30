/**
 * Next.js instrumentation hook — runs once when the production server starts.
 *
 * We use this to boot the in-process scheduler, replacing the old
 * scripts/orchestrator.js PM2 process. The scheduler calls library functions
 * directly — no HTTP boundary between heartbeat and brain.
 *
 * Requires: experimental.instrumentationHook = true in next.config.mjs
 */
export async function register() {
  // Only runs in production (Next.js skips register() in dev mode).
  // Wrap in try/catch so a scheduler failure doesn't crash the web server.
  try {
    const { startScheduler } = await import("@/lib/scheduler");
    await startScheduler();
    console.log("[instrumentation] scheduler started successfully");
  } catch (e) {
    console.error("[instrumentation] failed to start scheduler:", e);
    // Don't rethrow — let the server start even if the scheduler fails
  }
}
