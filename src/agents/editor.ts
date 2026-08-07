/**
 * Editor — fixes content quality issues found by Auditor.
 *
 *   - Disputed claims → deferred to the human /review workspace (never
 *     auto-researched — the human is the final authority on conflicts)
 *   - Re-research low-confidence verdicts (deep mode)
 *   - Enqueue re-summarize for stale summaries
 *   - Enqueue narrative generation for missing narratives
 *   - AI-human conflicts → flagged for human, cannot auto-resolve
 *   - Reports everything fixed and everything flagged
 *
 * Runs daily at 3 AM, after Auditor.
 */

import { prisma } from "@/lib/db";
import { enqueueTask } from "@/lib/pending-tasks";
import { logPipelineRun } from "@/lib/pipeline-log";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const fixes: string[] = [];
  const flagged: string[] = [];

  // 1. Disputed claims belong to the human now — flag, don't auto-research.
  //    The /review page is the sole workspace for their verdict.
  const disputedClaims = await prisma.claim.count({
    where: { status: "disputed" },
  });
  if (disputedClaims > 0) {
    flagged.push(`${disputedClaims} disputed claim(s) awaiting your verdict on /review`);
  }

  // 2. Re-research low-confidence verdicts (deep mode detects this in the two-pass)
  const lowConfClaims = await prisma.claim.findMany({
    where: {
      researchStatus: "done",
      status: { in: ["supported", "refuted"] },
      evidence: { contains: "(low)" },
    },
    select: { id: true, stock: { select: { ticker: true } } },
    take: 10,
  });

  if (lowConfClaims.length > 0) {
    for (const c of lowConfClaims) {
      await enqueueTask({
        kind: "research",
        claimId: c.id,
        ticker: c.stock.ticker,
        source: "scheduler",
        depth: "deep",
      });
    }
    fixes.push(`Enqueued re-research for ${lowConfClaims.length} low-confidence verdicts`);
  }

  // 3. Enqueue re-summarize for stale summaries
  const staleSummaryStocks = await prisma.stock.findMany({
    where: { summary: { not: null } },
    select: {
      ticker: true,
      lastSummaryAt: true,
      claims: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const stale = staleSummaryStocks.filter(
    (s) =>
      s.lastSummaryAt &&
      s.claims.length > 0 &&
      s.claims[0].createdAt > s.lastSummaryAt
  );
  if (stale.length > 0) {
    for (const s of stale.slice(0, 10)) {
      await enqueueTask({ kind: "summarize", ticker: s.ticker, source: "scheduler" });
    }
    fixes.push(`Enqueued re-summarize for ${Math.min(stale.length, 10)} stale stocks`);
  }

  // 4. Enqueue narrative for missing narratives on high-depth stocks
  const missingNarrative = await prisma.stock.findMany({
    where: {
      chokepointDepth: { gte: 4 },
      summary: { not: null },
      narrative: null,
    },
    select: { ticker: true },
    take: 10,
  });
  if (missingNarrative.length > 0) {
    for (const s of missingNarrative) {
      await enqueueTask({ kind: "narrative", ticker: s.ticker, source: "scheduler" });
    }
    fixes.push(`Enqueued narrative for ${missingNarrative.length} depth-4+ stocks`);
  }

  // 5. AI-human conflicts — flag for human review
  const skepticalWords = /\b(disagree|wrong|incorrect|not true|doubt|skeptical|question|unsure|maybe not)\b/i;
  const conflicts = await prisma.claim.findMany({
    where: {
      status: "supported",
      humanNote: { not: null },
    },
    select: { id: true, text: true, humanNote: true, stock: { select: { ticker: true } } },
    take: 20,
  });
  const flaggedConflicts = conflicts.filter((c) => c.humanNote && skepticalWords.test(c.humanNote));
  if (flaggedConflicts.length > 0) {
    flagged.push(
      `${flaggedConflicts.length} AI-human conflicts flagged: ` +
        flaggedConflicts.map((c) => `$${c.stock.ticker} claim#${c.id}`).join(", ")
    );
  }

  await logPipelineRun({
    stage: "editor",
    status: "completed",
    decision:
      fixes.length === 0 && flagged.length === 0
        ? "Nothing to fix"
        : [...fixes, ...flagged].join("; "),
  });

  return {
    ok: true,
    message:
      fixes.length === 0 && flagged.length === 0
        ? "Nothing to fix"
        : [...fixes, ...flagged].join(". "),
    fixes,
    flagged,
  };
}

const agent: Agent = {
  key: "editor",
  name: "Editor",
  emoji: "✏️",
  description: "Fixes content quality issues; flags conflicts for human review",
  stages: ["editor"],
  run,
};

registerAgent(agent);
