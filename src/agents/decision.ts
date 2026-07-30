/**
 * Decision agent — deep investment thesis generation for top opportunities.
 *
 * Runs daily at 4 AM. Finds top 10 scored stocks with summaries, enqueues
 * thesis generation through the task queue (new `decision` task kind).
 * The drain executes each thesis and notifies Telegram on completion.
 */

import { prisma } from "@/lib/db";
import { enqueueTask } from "@/lib/pending-tasks";
import { assignBucket, type ScoringInput } from "@/lib/scoring";
import { logPipelineRun } from "@/lib/pipeline-log";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

const TOP_N = 10;

async function run(_input?: AgentInput): Promise<AgentResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, message: "DEEPSEEK_API_KEY not configured" };

  // Find stocks that are candidates for deep thesis analysis:
  // must have a summary, some claims, and not be in the "pass" bucket.
  const stocks = await prisma.stock.findMany({
    where: {
      summary: { not: null },
      claims: { some: {} },
    },
    select: {
      ticker: true,
      name: true,
      summary: true,
      chokepointDepth: true,
      marketCap: true,
      pbRatio: true,
      currentPrice: true,
      claims: { select: { status: true } },
    },
  });

  // Score each stock and filter to strong_buy + watch
  const scored = stocks
    .map((s) => {
      const counts = { supported: 0, refuted: 0, disputed: 0, unverified: 0 };
      for (const c of s.claims) {
        if (c.status in counts) counts[c.status as keyof typeof counts]++;
      }
      const input: ScoringInput = {
        chokepointDepth: s.chokepointDepth,
        pbRatio: s.pbRatio,
        marketCap: s.marketCap,
        currentPrice: s.currentPrice,
        summary: s.summary,
        totalClaims: s.claims.length,
        supportedClaims: counts.supported,
        refutedClaims: counts.refuted,
      };
      return { ticker: s.ticker, bucket: assignBucket(input) };
    })
    .filter((s) => s.bucket !== "pass")
    .sort((a, b) => {
      const order = { strong_buy: 0, watch: 1, pass: 2 };
      return order[a.bucket] - order[b.bucket];
    });

  const candidates = scored.slice(0, TOP_N);

  if (candidates.length === 0) {
    await logPipelineRun({
      stage: "decision",
      status: "completed",
      decision: "No scored stocks with summaries found",
    });
    return { ok: true, message: "No scored stocks with summaries found" };
  }

  // Enqueue each thesis through the task queue for reliability.
  // The drain will execute, retry on failure, and notify Telegram.
  for (const c of candidates) {
    await enqueueTask({
      kind: "decision",
      ticker: c.ticker,
      source: "scheduler",
    });
  }

  console.log(
    `[decision] enqueued ${candidates.length} theses: ${candidates.map((c) => c.ticker).join(", ")}`
  );

  await logPipelineRun({
    stage: "decision",
    status: "completed",
    decision: `Enqueued ${candidates.length} investment theses`,
    output: { candidates: candidates.map((c) => c.ticker) },
  });

  return {
    ok: true,
    message: `Enqueued ${candidates.length} investment theses via task queue`,
    candidates: candidates.map((c) => c.ticker),
  };
}

const agent: Agent = {
  key: "decision",
  name: "Decision",
  emoji: "🧠",
  description: "Deep investment thesis generation for top-scored opportunities (via task queue)",
  stages: ["decision"],
  run,
};

registerAgent(agent);
