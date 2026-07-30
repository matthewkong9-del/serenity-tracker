/**
 * Watchdog — detects infrastructure and data-quality problems.
 *
 * Scans for:
 *   - Failed pipeline runs in last 24h (excluding auto-cleared)
 *   - Stuck pipeline runs (>10 min started)
 *   - Dead PendingTasks (exhausted retries)
 *   - Dead claims (researchStatus = "dead")
 *
 * Runs every 5 minutes. Alerts trigger Ops to fix.
 */

import { prisma } from "@/lib/db";
import { logPipelineRun } from "@/lib/pipeline-log";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const NOT_AUTO_CLEARED = { NOT: { error: { startsWith: "Auto-cleared by Ops" } } };

  const [failed24h, stuck24h, deadTasks, deadClaims] = await Promise.all([
    prisma.pipelineRun.count({
      where: {
        status: "failed",
        startedAt: { gte: twentyFourHoursAgo },
        ...NOT_AUTO_CLEARED,
      },
    }),
    prisma.pipelineRun.count({
      where: {
        status: "started",
        startedAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) },
      },
    }),
    prisma.pendingTask.findMany({
      where: { status: "dead" },
      select: { id: true, kind: true, ticker: true, lastError: true },
      take: 20,
    }),
    prisma.claim.count({ where: { researchStatus: "dead" } }),
  ]);

  const issues: string[] = [];
  if (failed24h > 0) issues.push(`${failed24h} failed pipeline runs in 24h`);
  if (stuck24h > 0) issues.push(`${stuck24h} stuck pipeline runs (>10 min started)`);
  if (deadTasks.length > 0) {
    const detail = deadTasks
      .map((t) => `${t.kind}${t.ticker ? ` $${t.ticker}` : ""}: ${t.lastError?.slice(0, 60) || "no error"}`)
      .join("; ");
    issues.push(`${deadTasks.length} dead task(s): ${detail}`);
  }
  if (deadClaims > 0) issues.push(`${deadClaims} dead claims (research exhausted)`);

  await logPipelineRun({
    stage: "watchdog",
    status: "completed",
    decision: issues.length === 0 ? "All systems healthy" : issues.join("; "),
  });

  return {
    ok: true,
    message: issues.length === 0 ? "All systems healthy" : issues.join(". "),
    issues,
    deadTasks: deadTasks.map((t) => ({
      id: t.id,
      kind: t.kind,
      ticker: t.ticker,
      error: t.lastError,
    })),
    deadClaims,
  };
}

const agent: Agent = {
  key: "watchdog",
  name: "Watchdog",
  emoji: "🐕",
  description: "Scans for failed runs, stuck runs, and dead tasks every 5 min",
  stages: ["watchdog"],
  run,
};

registerAgent(agent);
