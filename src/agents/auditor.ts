import { prisma } from "@/lib/db";
import { logPipelineRun } from "@/lib/pipeline-log";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const issues: string[] = [];

  const disputed = await prisma.claim.count({ where: { status: "disputed" } });
  if (disputed > 0) issues.push(`${disputed} disputed claims need review`);

  const depth4Stocks = await prisma.stock.findMany({
    where: { chokepointDepth: { gte: 4 } },
    select: {
      ticker: true,
      claims: { where: { status: "supported" }, select: { id: true } },
    },
  });

  const unsupportedDepth4 = depth4Stocks.filter((s) => s.claims.length === 0);
  if (unsupportedDepth4.length > 0) {
    issues.push(
      `${unsupportedDepth4.length} depth-4+ stocks with no supporting evidence: ` +
        unsupportedDepth4.map((s) => `$${s.ticker}`).join(", ")
    );
  }

  await logPipelineRun({
    stage: "auditor",
    status: "completed",
    decision: issues.length === 0 ? "All content checks passed" : issues.join("; "),
  });

  return {
    ok: true,
    message: issues.length === 0 ? "All content checks passed" : issues.join(". "),
    issues,
  };
}

const agent: Agent = {
  key: "auditor",
  name: "Auditor",
  emoji: "🔍",
  description: "Scans for content quality issues daily at 3 AM",
  stages: ["auditor"],
  run,
};

registerAgent(agent);
