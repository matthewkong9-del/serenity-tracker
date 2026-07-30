/**
 * Analysis agent — understands each stock through summarization + relationships + narrative.
 *
 * All actual work is enqueued through the PendingTask queue. The drain
 * executes summarize → extract → narrative as a chain. This agent's run()
 * just finds stale stocks and enqueues them.
 */

import { prisma } from "@/lib/db";
import { needsSummary } from "@/lib/summarize";
import { enqueueTask, hasPendingTask } from "@/lib/pending-tasks";
import { logPipelineRun } from "@/lib/pipeline-log";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(input?: AgentInput): Promise<AgentResult> {
  const ticker = input?.ticker;

  // Single-stock trigger (from "Run Now" on stock page)
  if (ticker) {
    await enqueueTask({ kind: "summarize", ticker, source: "manual" });
    return {
      ok: true,
      message: `Enqueued summarize for $${ticker}`,
      ticker,
    };
  }

  // Bulk: find stale stocks and enqueue
  const stocksToCheck = await prisma.stock.findMany({
    select: {
      ticker: true,
      lastSummaryAt: true,
      files: { select: { createdAt: true, markdown: true } },
      notes: { select: { createdAt: true } },
      claims: { select: { createdAt: true, updatedAt: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const stale = stocksToCheck.filter((s) => needsSummary(s));
  const actionable = stale.filter(
    (s) =>
      s.claims.length > 0 ||
      s.notes.length > 0 ||
      s.files.some((f) => f.markdown)
  );

  let enqueued = 0;
  for (const s of actionable.slice(0, 3)) {
    if (!(await hasPendingTask("summarize", s.ticker))) {
      await enqueueTask({ kind: "summarize", ticker: s.ticker, source: "manual" });
      enqueued++;
    }
  }

  await logPipelineRun({
    stage: "summarize",
    status: "completed",
    decision:
      enqueued > 0
        ? `Enqueued summarize for ${enqueued} stocks`
        : actionable.length === 0
          ? "All stocks up to date"
          : "Stale stocks already queued",
  });

  return {
    ok: true,
    message:
      enqueued > 0
        ? `Enqueued summarize for ${enqueued} stocks`
        : actionable.length === 0
          ? "All stocks up to date"
          : `${actionable.length} stale stocks already queued`,
  };
}

const agent: Agent = {
  key: "analysis",
  name: "Analysis",
  emoji: "📊",
  description: "Summarizes stocks, writes narratives, maps relationships (via task queue)",
  stages: ["summarize", "narrative", "relationship"],
  run,
};

registerAgent(agent);
