import { prisma } from "@/lib/db";
import { researchNewClaims } from "@/lib/research";
import { logPipelineRun } from "@/lib/pipeline-log";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, message: "DEEPSEEK_API_KEY not configured" };

  const fixes: string[] = [];

  // 1. Deep-research disputed claims
  const disputedClaims = await prisma.claim.findMany({
    where: { status: "disputed" },
    include: { stock: { select: { ticker: true } } },
    take: 5,
  });

  if (disputedClaims.length > 0) {
    const tickers = Array.from(new Set(disputedClaims.map((c) => c.stock.ticker)));
    let researched = 0;
    for (const t of tickers) {
      try {
        const result = await researchNewClaims([t], apiKey, "deep");
        researched += result.researched;
      } catch (e: any) {
        console.error(`[editor] deep research on ${t} failed: ${e.message}`);
      }
    }
    if (researched > 0) {
      fixes.push(
        `Deep-researched ${researched} disputed claims across ${tickers.length} stocks`
      );
    }
  }

  // 2. Flag depth-4 stocks with zero supporting evidence
  const depth4Stocks = await prisma.stock.findMany({
    where: { chokepointDepth: { gte: 4 } },
    select: {
      ticker: true,
      claims: { where: { status: "supported" }, select: { id: true } },
    },
  });

  const unsupported = depth4Stocks.filter((s) => s.claims.length === 0);
  if (unsupported.length > 0) {
    fixes.push(
      `${unsupported.length} depth-4+ stocks need evidence: ` +
        unsupported.map((s) => `$${s.ticker}`).join(", ")
    );
  }

  await logPipelineRun({
    stage: "editor",
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
  key: "editor",
  name: "Editor",
  emoji: "✏️",
  description: "Fixes content quality issues found by Auditor",
  stages: ["editor"],
  run,
};

registerAgent(agent);
