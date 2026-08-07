/**
 * Research agent — fills knowledge gaps and verifies claims.
 *
 * Four responsibilities:
 *   1. Content coverage (daily) — find stocks with zero content, search web,
 *      build initial dossier so they become summarizable.
 *   2. Claim verification (continuous) — enqueue pending claims for research
 *      via the PendingTask queue (the drain executes actual research).
 *   3. Stale re-research (daily at 5 AM) — re-verify claims older than 90 days.
 *   4. Quality review (weekly) — spot-check a sample of recent verdicts for
 *      weak or contradictory results.
 */

import { prisma } from "@/lib/db";
import { braveSearch } from "@/lib/brave";
import { chatJson } from "@/lib/deepseek";
import { enqueueTask } from "@/lib/pending-tasks";
import { logPipelineRun } from "@/lib/pipeline-log";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

// ── Content coverage ─────────────────────────────────────────────────────

async function runContentCoverage(apiKey: string): Promise<string[]> {
  const actions: string[] = [];

  // Find empty stocks: no tweets, no files with markdown, no notes, no claims.
  const allStocks = await prisma.stock.findMany({
    select: {
      ticker: true,
      name: true,
      _count: {
        select: { claims: true, notes: true, files: true },
      },
      files: { select: { markdown: true } },
    },
  });

  const empty = allStocks.filter(
    (s) =>
      s._count.claims === 0 &&
      s._count.notes === 0 &&
      !s.files.some((f) => f.markdown)
  );

  if (empty.length === 0) {
    actions.push("Content coverage: no empty stocks found");
    return actions;
  }

  // Process up to 10 per run (cost control — each stock is 1-2 search calls).
  const batch = empty.slice(0, 10);
  actions.push(
    `Content coverage: searching for ${batch.length} empty stocks (${empty.length} total)`
  );

  for (const stock of batch) {
    try {
      const query = `${stock.name || stock.ticker} ${stock.ticker} company profile business overview`;
      const results = await braveSearch(query, 3);

      if (results.length === 0) {
        actions.push(`  $${stock.ticker}: no search results`);
        continue;
      }

      // Build a simple dossier from search snippets
      const snippets = results
        .map((r) => `${r.title}\n${r.description || ""}\n${r.url}`)
        .join("\n\n");

      const dossierPrompt = `Summarize the following search results about $${stock.ticker} into a concise company profile. Include: what they do, key products/services, market position, and any notable competitive advantages. Format as Markdown. Limit to 300 words.

Search results:
${snippets.slice(0, 3000)}`;

      const profile = await chatJson<{ profile: string }>(
        [{ role: "user", content: dossierPrompt }],
        apiKey,
        { temperature: 0.3, purpose: "content_coverage" }
      );

      if (profile.profile) {
        // Save as a File entry so the stock becomes summarizable
        await prisma.file.create({
          data: {
            stockId: (await prisma.stock.findUnique({ where: { ticker: stock.ticker }, select: { id: true } }))!.id,
            filename: `web-research-${Date.now()}.md`,
            originalName: `Web Research: ${stock.ticker}`,
            fileType: "text/markdown",
            fileSize: Buffer.byteLength(profile.profile),
            markdown: profile.profile,
            description: "Auto-generated company profile from web search",
          },
        });
        actions.push(`  $${stock.ticker}: dossier created`);
      }
    } catch (e: any) {
      actions.push(`  $${stock.ticker}: failed — ${e.message?.slice(0, 80)}`);
    }
  }

  return actions;
}

// ── Stale re-research ────────────────────────────────────────────────────

async function runStaleResearch(): Promise<string[]> {
  const actions: string[] = [];
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const staleClaims = await prisma.claim.findMany({
    where: {
      researchStatus: "done",
      researchedAt: { lt: cutoff },
      status: { not: "disputed" }, // skip disputed — they need human review
    },
    select: { id: true, stock: { select: { ticker: true } } },
    orderBy: { impactScore: "desc" },
    take: 20,
  });

  for (const c of staleClaims) {
    await enqueueTask({
      kind: "research",
      claimId: c.id,
      ticker: c.stock.ticker,
      source: "scheduler",
      depth: "deep",
    });
  }

  if (staleClaims.length > 0) {
    actions.push(`Stale research: queued ${staleClaims.length} claims (>90 days)`);
  }
  return actions;
}

// ── Quality review ───────────────────────────────────────────────────────

async function runQualityReview(apiKey: string): Promise<string[]> {
  const actions: string[] = [];

  // Spot-check: find recent "supported" verdicts with low confidence.
  const recentVerdicts = await prisma.claim.findMany({
    where: {
      researchStatus: "done",
      researchedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      status: "supported",
      evidence: { contains: "low" }, // "low" confidence in evidence text
    },
    select: { id: true, text: true, stock: { select: { ticker: true } } },
    take: 5,
  });

  if (recentVerdicts.length > 0) {
    actions.push(
      `Quality review: ${recentVerdicts.length} low-confidence supported verdicts found — flagging for re-research`
    );
    for (const c of recentVerdicts) {
      await enqueueTask({
        kind: "research",
        claimId: c.id,
        ticker: c.stock.ticker,
        source: "scheduler",
        depth: "deep",
      });
    }
  } else {
    actions.push("Quality review: no weak verdicts found");
  }

  return actions;
}

// ── Agent ────────────────────────────────────────────────────────────────

async function run(input?: AgentInput): Promise<AgentResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, message: "DEEPSEEK_API_KEY not configured" };

  const actions: string[] = [];
  const mode = (input as any)?.mode || "full";

  // Content coverage (daily) — can also be triggered standalone via mode="coverage"
  if (mode === "full" || mode === "coverage") {
    const coverageActions = await runContentCoverage(apiKey);
    actions.push(...coverageActions);
  }

  // Stale re-research (daily at 5 AM)
  if (mode === "full" || mode === "stale") {
    const staleActions = await runStaleResearch();
    actions.push(...staleActions);
  }

  // Quality review (weekly)
  if (mode === "full" || mode === "quality") {
    const qualityActions = await runQualityReview(apiKey);
    actions.push(...qualityActions);
  }

  await logPipelineRun({
    stage: "research",
    status: "completed",
    decision: actions.join("; ") || "No research work needed",
  });

  return {
    ok: true,
    message: actions.join(". ") || "No research work needed",
    actions,
  };
}

const agent: Agent = {
  key: "research",
  name: "Research",
  emoji: "🔬",
  description: "Content coverage, claim verification, stale re-research, quality review",
  stages: ["research", "verify", "research-all"],
  run,
};

registerAgent(agent);
