import { prisma } from "@/lib/db";
import { logPipelineRun } from "@/lib/pipeline-log";
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

  // 3. Reset failed research claims → pending
  const failedClaims = await prisma.claim.count({
    where: { researchStatus: "failed" },
  });
  if (failedClaims > 0) {
    await prisma.claim.updateMany({
      where: { researchStatus: "failed" },
      data: { researchStatus: "pending" },
    });
    fixes.push(`Reset ${failedClaims} failed research claims → pending`);
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
