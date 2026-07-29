import { prisma } from "@/lib/db";
import { logPipelineRun } from "@/lib/pipeline-log";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [failed24h, stuck24h] = await Promise.all([
    prisma.pipelineRun.count({
      where: {
        status: "failed",
        startedAt: { gte: twentyFourHoursAgo },
        NOT: { error: { startsWith: "Auto-cleared by Ops" } },
      },
    }),
    prisma.pipelineRun.count({
      where: {
        status: "started",
        startedAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) },
      },
    }),
  ]);

  const issues: string[] = [];
  if (failed24h > 0) issues.push(`${failed24h} failed pipeline runs in 24h`);
  if (stuck24h > 0) issues.push(`${stuck24h} stuck pipeline runs (>10 min started)`);

  await logPipelineRun({
    stage: "watchdog",
    status: "completed",
    decision: issues.length === 0 ? "All systems healthy" : issues.join("; "),
  });

  return {
    ok: true,
    message: issues.length === 0 ? "All systems healthy" : issues.join(". "),
    issues,
  };
}

const agent: Agent = {
  key: "watchdog",
  name: "Watchdog",
  emoji: "🐕",
  description: "Scans for infrastructure issues every 5 min",
  stages: ["watchdog"],
  run,
};

registerAgent(agent);
