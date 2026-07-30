/**
 * Decision agent — deep investment thesis generation for top opportunities.
 *
 * Runs daily at 4:30 AM UTC (after price refresh + auditor/editor).
 * Finds the top ~10 scored stocks with summaries, generates a deep
 * investment thesis for each, and persists to the Decision table.
 *
 * This is the "autonomous endgame" agent — it reviews the full research
 * dossier and produces buy/hold/sell recommendations.
 */

import { prisma } from "@/lib/db";
import { generateInvestmentThesis, saveThesis } from "@/lib/decision";
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
    return { ok: true, message: "No scored stocks with summaries found" };
  }

  console.log(
    `[decision] analyzing top ${candidates.length} opportunities: ${candidates.map((c) => c.ticker).join(", ")}`
  );

  let generated = 0;
  let failed = 0;

  for (const c of candidates) {
    try {
      const result = await generateInvestmentThesis(c.ticker, apiKey);
      if (result.thesis) {
        await saveThesis(c.ticker, result.thesis);
        generated++;
        console.log(
          `[decision] ${c.ticker}: ${result.thesis.action.toUpperCase()} (${result.thesis.confidence})`
        );
      } else {
        failed++;
        console.warn(`[decision] ${c.ticker}: ${result.error || "no thesis generated"}`);
      }
    } catch (e: any) {
      failed++;
      console.error(`[decision] ${c.ticker} error: ${e.message}`);
    }
  }

  await logPipelineRun({
    stage: "decision",
    status: "completed",
    decision: `Generated ${generated} theses, ${failed} failed out of ${candidates.length} candidates`,
    output: {
      candidates: candidates.map((c) => c.ticker),
      generated,
      failed,
    },
  });

  return {
    ok: true,
    message: `Generated ${generated} investment theses (${failed} failed)`,
    generated,
    failed,
    candidates: candidates.map((c) => c.ticker),
  };
}

const agent: Agent = {
  key: "decision",
  name: "Decision",
  emoji: "🧠",
  description: "Deep investment thesis generation for top-scored opportunities",
  stages: ["decision"],
  run,
};

registerAgent(agent);
