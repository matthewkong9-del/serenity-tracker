import { prisma } from "@/lib/db";
import { isSchedulerRunning } from "@/lib/scheduler";
import { getAllAgents } from "@/agents";
import type { Agent } from "@/agents/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/status
 *
 * Aggregates agent state from PipelineRun + ApiCallLog into status cards,
 * activity feed, and system health summary. Agent definitions come from
 * the registry (src/agents/registry.ts) instead of a hardcoded list.
 */

// ── Agent definitions (from registry) ──────────────────────────────────

const AGENTS: Agent[] = getAllAgents();

/** Filter that excludes runs already handled by Ops — those were stuck runs
 *  that ops auto-cleared; they should not be re-flagged as errors. */
const NOT_AUTO_CLEARED = { NOT: { error: { startsWith: "Auto-cleared by Ops" } } };

// ── Helper: get recent pipeline stats for a set of stages ─────────────

async function getAgentStats(stages: string[]) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Last run
  const lastRun = await prisma.pipelineRun.findFirst({
    where: { stage: { in: stages } },
    orderBy: { startedAt: "desc" },
    select: {
      stage: true,
      status: true,
      stockTicker: true,
      decision: true,
      error: true,
      cost: true,
      startedAt: true,
      completedAt: true,
    },
  });

  // Counts in last 24h
  const [completed24h, failed24h, running24h] = await Promise.all([
    prisma.pipelineRun.count({
      where: {
        stage: { in: stages },
        status: "completed",
        startedAt: { gte: twentyFourHoursAgo },
      },
    }),
    prisma.pipelineRun.count({
      where: {
        stage: { in: stages },
        status: "failed",
        startedAt: { gte: twentyFourHoursAgo },
        ...NOT_AUTO_CLEARED,
      },
    }),
    prisma.pipelineRun.count({
      where: {
        stage: { in: stages },
        status: "started",
      },
    }),
  ]);

  // All-time totals
  const [totalCompleted, totalFailed] = await Promise.all([
    prisma.pipelineRun.count({
      where: { stage: { in: stages }, status: "completed" },
    }),
    prisma.pipelineRun.count({
      where: { stage: { in: stages }, status: "failed" },
    }),
  ]);

  // Agent-specific metric
  let metric: { label: string; value: string } | null = null;

  // Analysis agent: stocks with summaries
  if (stages.includes("summarize")) {
    const count = await prisma.stock.count({
      where: { summary: { not: null } },
    });
    metric = { label: "Stocks analyzed", value: String(count) };
  }

  // Research agent: pending claims
  if (stages.includes("research")) {
    const pending = await prisma.claim.count({
      where: { status: "unverified" },
    });
    metric = { label: "Claims pending", value: String(pending) };
  }

  // Price agent: stocks with prices
  if (stages.includes("price_refresh")) {
    const priced = await prisma.stock.count({
      where: { currentPrice: { not: null } },
    });
    metric = { label: "Stocks priced", value: String(priced) };
  }

  // Ingest agent: tweets synced
  if (stages.includes("sync")) {
    const tweetCount = await prisma.tweet.count();
    metric = { label: "Tweets synced", value: String(tweetCount) };
  }

  // Watchdog: errors in last 24h (excluding auto-cleared)
  if (stages.includes("watchdog")) {
    const errors24h = await prisma.pipelineRun.count({
      where: { status: "failed", startedAt: { gte: twentyFourHoursAgo }, ...NOT_AUTO_CLEARED },
    });
    metric = { label: "Errors (24h)", value: String(errors24h) };
  }

  // Auditor: unresolved contradictions (claims with status "disputed")
  if (stages.includes("auditor")) {
    const disputed = await prisma.claim.count({
      where: { status: "disputed" },
    });
    metric = { label: "Disputed claims", value: String(disputed) };
  }

  // Ops: stuck runs + failed API calls fixed
  if (stages.includes("ops")) {
    const stuck = await prisma.pipelineRun.count({
      where: {
        status: "started",
        startedAt: { lte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });
    metric = { label: "Stuck runs", value: String(stuck) };
  }

  // Editor: claims auto-fixed (disputed claims that were re-researched)
  if (stages.includes("editor")) {
    const depth4NoEvidence = await prisma.stock.count({
      where: {
        chokepointDepth: { gte: 4 },
        claims: { none: { status: "supported" } },
      },
    });
    metric = { label: "Depth-4 gaps", value: String(depth4NoEvidence) };
  }

  // Determine current status
  let currentStatus: "running" | "idle" | "error" | "paused" = "idle";
  if (running24h > 0) currentStatus = "running";
  if (failed24h > 0 && completed24h === 0) currentStatus = "error";
  // Orchestrator: check if in-process scheduler is running
  if (stages.includes("orchestrate") && !isSchedulerRunning()) {
    currentStatus = "paused";
  }

  return {
    status: currentStatus,
    lastRun: lastRun
      ? {
          stage: lastRun.stage,
          status: lastRun.status,
          stockTicker: lastRun.stockTicker,
          decision: lastRun.decision,
          error: lastRun.error?.slice(0, 200) || null,
          cost: lastRun.cost,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
        }
      : null,
    counts24h: { completed: completed24h, failed: failed24h },
    countsAll: { completed: totalCompleted, failed: totalFailed },
    metric,
  };
}

// ── GET ───────────────────────────────────────────────────────────────

export async function GET() {
  // System health
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [errors24h, costs24h, pendingClaims, lastOrchTick, deadTasks, deadClaimsCount] = await Promise.all([
    prisma.pipelineRun.count({
      where: { status: "failed", startedAt: { gte: twentyFourHoursAgo }, ...NOT_AUTO_CLEARED },
    }),
    prisma.apiCallLog.aggregate({
      where: { createdAt: { gte: twentyFourHoursAgo } },
      _sum: { estimatedCost: true },
    }),
    prisma.claim.count({ where: { status: "unverified" } }),
    prisma.pipelineRun.findFirst({
      where: { stage: "orchestrate" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, decision: true },
    }),
    // Dead-letter surfacing (ADR-0001): tasks that exhausted retries.
    prisma.pendingTask.findMany({
      where: { status: "dead" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        kind: true,
        ticker: true,
        claimId: true,
        attempts: true,
        lastError: true,
        updatedAt: true,
      },
    }),
    prisma.claim.count({ where: { researchStatus: "dead" } }),
  ]);

  // Agent cards
  const agents = await Promise.all(
    AGENTS.map(async (def) => {
      const stats = await getAgentStats(def.stages);
      return {
        key: def.key,
        name: def.name,
        emoji: def.emoji,
        description: def.description,
        ...stats,
      };
    })
  );

  // Activity feed: last 60 PipelineRun entries
  const recentActivity = await prisma.pipelineRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 60,
    select: {
      id: true,
      stage: true,
      status: true,
      stockTicker: true,
      decision: true,
      error: true,
      cost: true,
      startedAt: true,
      completedAt: true,
    },
  });

  // Watchdog alerts: failed runs in last 24h (excluding auto-cleared)
  const watchdogAlerts = await prisma.pipelineRun.findMany({
    where: {
      status: "failed",
      startedAt: { gte: twentyFourHoursAgo },
      ...NOT_AUTO_CLEARED,
    },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      id: true,
      stage: true,
      stockTicker: true,
      error: true,
      startedAt: true,
    },
  });

  // System health summary
  const totalErrors24h = errors24h;
  let health: "healthy" | "warning" | "critical" = "healthy";
  if (totalErrors24h > 10) health = "critical";
  else if (totalErrors24h > 3 || deadTasks.length > 0) health = "warning";

  return NextResponse.json({
    health,
    agents,
    watchdogAlerts,
    recentActivity,
    deadTasks,
    summary: {
      totalErrors24h,
      cost24h: costs24h._sum.estimatedCost || 0,
      pendingClaims,
      deadTasks: deadTasks.length,
      deadClaims: deadClaimsCount,
      lastOrchTick: lastOrchTick?.startedAt || null,
      lastOrchDecision: lastOrchTick?.decision || null,
    },
  });
}
