/**
 * Auditor — scans for content quality issues daily at 3 AM.
 *
 * Eight scans:
 *   1. Disputed claims needing review
 *   2. Depth-4+ stocks with no supporting evidence
 *   3. Stale summaries (new claims since last summary)
 *   4. AI-human conflicts (AI verdict contradicts human note)
 *   5. Stale research (claims researched >90 days ago)
 *   6. Low-confidence verdicts
 *   7. Empty stocks (zero content)
 *   8. Missing narratives (depth-4+ with summary but no narrative)
 */

import { prisma } from "@/lib/db";
import { logPipelineRun } from "@/lib/pipeline-log";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const issues: string[] = [];

  // 1. Disputed claims needing review
  const disputed = await prisma.claim.count({ where: { status: "disputed" } });
  if (disputed > 0) issues.push(`${disputed} disputed claims need review`);

  // 2. Depth-4+ stocks with no supporting evidence
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

  // 3. Stale summaries — stocks with new claims after last summary
  const staleSummaryStocks = await prisma.stock.findMany({
    where: { summary: { not: null } },
    select: {
      ticker: true,
      lastSummaryAt: true,
      claims: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const staleSummaries = staleSummaryStocks.filter(
    (s) =>
      s.lastSummaryAt &&
      s.claims.length > 0 &&
      s.claims[0].createdAt > s.lastSummaryAt
  );
  if (staleSummaries.length > 0) {
    issues.push(
      `${staleSummaries.length} stocks have new claims since last summary: ` +
        staleSummaries.slice(0, 10).map((s) => `$${s.ticker}`).join(", ") +
        (staleSummaries.length > 10 ? ` +${staleSummaries.length - 10} more` : "")
    );
  }

  // 4. AI-human conflicts — claims where AI says "supported" but human left a note
  const conflicts = await prisma.claim.findMany({
    where: {
      status: "supported",
      humanNote: { not: null },
    },
    select: { id: true, text: true, humanNote: true, stock: { select: { ticker: true } } },
    take: 20,
  });
  // Simple heuristic: if human note contains skeptical language
  const skepticalWords = /\b(disagree|wrong|incorrect|not true|doubt|skeptical|question|unsure|maybe not)\b/i;
  const flaggedConflicts = conflicts.filter((c) => c.humanNote && skepticalWords.test(c.humanNote));
  if (flaggedConflicts.length > 0) {
    issues.push(
      `${flaggedConflicts.length} AI-human conflicts: ` +
        flaggedConflicts.map((c) => `$${c.stock.ticker} claim#${c.id}`).join(", ")
    );
  }

  // 5. Stale research — claims researched >90 days ago
  const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const staleResearch = await prisma.claim.count({
    where: {
      researchStatus: "done",
      researchedAt: { lt: cutoff90d },
      status: { not: "disputed" },
    },
  });
  if (staleResearch > 0) {
    issues.push(`${staleResearch} claims with research older than 90 days`);
  }

  // 6. Low-confidence verdicts
  const lowConfidence = await prisma.claim.count({
    where: {
      researchStatus: "done",
      status: { in: ["supported", "refuted"] },
      evidence: { contains: "(low)" },
    },
  });
  if (lowConfidence > 0) {
    issues.push(`${lowConfidence} claims with low-confidence verdicts`);
  }

  // 7. Empty stocks (zero content)
  const allStocks = await prisma.stock.findMany({
    select: {
      ticker: true,
      _count: { select: { claims: true, notes: true, files: true } },
      files: { select: { markdown: true } },
    },
  });
  const emptyStocks = allStocks.filter(
    (s) =>
      s._count.claims === 0 &&
      s._count.notes === 0 &&
      !s.files.some((f) => f.markdown)
  );
  if (emptyStocks.length > 0) {
    issues.push(
      `${emptyStocks.length} empty stocks with no content: ` +
        emptyStocks.slice(0, 10).map((s) => `$${s.ticker}`).join(", ") +
        (emptyStocks.length > 10 ? ` +${emptyStocks.length - 10} more` : "")
    );
  }

  // 8. Missing narratives — depth-4+ with summary but no narrative
  const missingNarrative = await prisma.stock.count({
    where: {
      chokepointDepth: { gte: 4 },
      summary: { not: null },
      narrative: null,
    },
  });
  if (missingNarrative > 0) {
    issues.push(`${missingNarrative} depth-4+ stocks with summary but no narrative`);
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
  description: "Scans for 8 types of content quality issues daily at 3 AM",
  stages: ["auditor"],
  run,
};

registerAgent(agent);
