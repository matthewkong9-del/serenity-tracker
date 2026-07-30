import { prisma } from "@/lib/db";
import { logPipelineRun } from "@/lib/pipeline-log";
import { enqueueTask } from "@/lib/pending-tasks";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const now = new Date();
  const fixes: string[] = [];

  // 1. Clear stuck PipelineRun entries (started > 15 min → failed). Skip triage.
  const stuckCutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const stuck = await prisma.pipelineRun.findMany({
    where: {
      status: "started",
      startedAt: { lte: stuckCutoff },
      stage: { not: "triage" },
    },
    select: { id: true, stage: true, stockTicker: true },
  });

  if (stuck.length > 0) {
    await prisma.pipelineRun.updateMany({
      where: { id: { in: stuck.map((r) => r.id) } },
      data: {
        status: "failed",
        completedAt: now,
        error: "Auto-cleared by Ops: stuck > 15 minutes",
      },
    });
    fixes.push(`Cleared ${stuck.length} stuck pipeline runs`);
  }

  // 2. Clear abandoned triage entries (48h timeout)
  const triageCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const abandonedTriage = await prisma.pipelineRun.findMany({
    where: {
      stage: "triage",
      status: "started",
      startedAt: { lte: triageCutoff },
    },
    select: { id: true },
  });

  if (abandonedTriage.length > 0) {
    await prisma.pipelineRun.updateMany({
      where: { id: { in: abandonedTriage.map((r) => r.id) } },
      data: {
        status: "skipped",
        completedAt: now,
        error: "Auto-skipped by Ops: no user response after 48h",
      },
    });
    fixes.push(`Skipped ${abandonedTriage.length} abandoned triage entries`);
  }

  // 3. Re-queue orphaned failed research (failed claims with no pending task).
  // The drain's failTask owns retries for tasks it runs, but research called
  // outside the drain (Telegram reply, manual "Run Now") can leave a claim
  // "failed" with no retry task. Re-queue those through the task queue —
  // capped, and never touching "dead" claims (terminal: exhausted retries,
  // surfaced on the dashboard for human review).
  const failedClaims = await prisma.claim.findMany({
    where: { researchStatus: "failed" },
    select: { id: true, stock: { select: { ticker: true } } },
    take: 50,
  });
  if (failedClaims.length > 0) {
    const busyRows = await prisma.pendingTask.findMany({
      where: {
        kind: "research",
        status: { in: ["pending", "claimed"] },
        claimId: { in: failedClaims.map((c) => c.id) },
      },
      select: { claimId: true },
    });
    const busy = new Set(busyRows.map((r) => r.claimId));
    const orphans = failedClaims.filter((c) => !busy.has(c.id)).slice(0, 20);
    for (const c of orphans) {
      await enqueueTask({ kind: "research", claimId: c.id, ticker: c.stock.ticker });
    }
    if (orphans.length > 0) {
      fixes.push(`Re-queued ${orphans.length} orphaned failed research claims`);
    }
  }

  // 4. Reclaim orphaned tasks: a `claimed` task whose process died mid-run
  // (e.g. a PM2 restart) would never be re-drained. Reset claimed tasks older
  // than 5 min back to pending. (A single task runs well under the 2-min LLM
  // timeout, so 5 min guarantees it's truly orphaned.)
  const stuckTaskCutoff = new Date(now.getTime() - 5 * 60 * 1000);
  const stuckTasks = await prisma.pendingTask.count({
    where: { status: "claimed", updatedAt: { lte: stuckTaskCutoff } },
  });
  if (stuckTasks > 0) {
    await prisma.pendingTask.updateMany({
      where: { status: "claimed", updatedAt: { lte: stuckTaskCutoff } },
      data: { status: "pending" },
    });
    fixes.push(`Reclaimed ${stuckTasks} orphaned task(s)`);
  }

  await logPipelineRun({
    stage: "ops",
    status: "completed",
    decision: fixes.length === 0 ? "Nothing to fix" : fixes.join("; "),
  });

  return {
    ok: true,
    message: fixes.length === 0 ? "Nothing to fix" : fixes.join(". "),
    fixes,
  };
}

const agent: Agent = {
  key: "ops",
  name: "Ops",
  emoji: "🔧",
  description: "Auto-fixes infrastructure issues found by Watchdog",
  stages: ["ops"],
  run,
};

registerAgent(agent);
