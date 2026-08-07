/**
 * Core orchestration business logic.
 *
 * Contains the main orchestratorTick() function that the scheduler calls
 * every 30s, plus schedule helpers shared with scheduler.ts.
 *
 * The orchestrator decides WHAT to run and WHEN. All actual work is delegated
 * to agents via the PendingTask queue or agent registry.
 */

import { prisma } from "@/lib/db";
import { summarizeStock, needsSummary } from "@/lib/summarize";
import { generateNarrative } from "@/lib/narrative";
import { runExtractions } from "@/lib/relationships";
import { researchClaim } from "@/lib/research";
import { generateInvestmentThesis, saveThesis } from "@/lib/decision";
import { checkForOrders, parseResearchCommand, sendMessage } from "@/lib/telegram";
import { logPipelineRun } from "@/lib/pipeline-log";
import {
  drainPendingTasks,
  enqueueTask,
  hasPendingTask,
  notifyBatchComplete,
  type TaskHandlers,
} from "@/lib/pending-tasks";

// ── Types ──────────────────────────────────────────────────────────────

export interface OrchestratorTickResult {
  workDone: boolean;
  summary: string;
  actions: string[];
}

// ── Schedule state (persisted via ScheduleState, survives restarts) ────

/** In-memory cache of last-run timestamps, loaded from ScheduleState on boot.
 *  Persisted so a restart inside a job's hour window can't fire it twice. */
let scheduleCache = new Map<string, number>();

/** Load persisted last-run timestamps. Called once by startScheduler(). */
export async function initSchedule(): Promise<void> {
  const rows = await prisma.scheduleState.findMany();
  scheduleCache = new Map(rows.map((r) => [r.key, r.lastRunAt.getTime()]));
}

/** Record that a scheduled job just ran — updates cache + persists. */
export async function markRun(key: string): Promise<void> {
  const now = Date.now();
  scheduleCache.set(key, now);
  try {
    await prisma.scheduleState.upsert({
      where: { key },
      create: { key, lastRunAt: new Date(now) },
      update: { lastRunAt: new Date(now) },
    });
  } catch {
    // best-effort — a failed persist must not break the tick
  }
}

// ── Schedule helpers ───────────────────────────────────────────────────

export function shouldRun(key: string, intervalMs: number): boolean {
  return Date.now() - (scheduleCache.get(key) ?? 0) >= intervalMs;
}

export function isHourWindow(hour: number, key: string): boolean {
  const now = new Date();
  return now.getUTCHours() === hour && shouldRun(key, 23 * 60 * 60 * 1000);
}

export function isSunday(): boolean {
  return new Date().getUTCDay() === 0;
}

// ── Task handlers for the drain (injected into drainPendingTasks) ──────

const taskHandlers: TaskHandlers = {
  research: async (claimId, ticker, apiKey, depth) => {
    await researchClaim(claimId, ticker, apiKey, depth ?? "quick");
  },
  summarize: async (ticker, apiKey) => {
    await summarizeStock(ticker, apiKey);
  },
  extract: async (ticker, apiKey) => {
    await runExtractions(ticker, apiKey);
  },
  narrative: async (ticker, apiKey) => {
    await generateNarrative(ticker, apiKey);
  },
  decision: async (ticker, apiKey) => {
    const result = await generateInvestmentThesis(ticker, apiKey);
    if (result.thesis) {
      await saveThesis(ticker, result.thesis);
    } else {
      throw new Error(result.error || "no thesis generated");
    }
  },
};

// ── Core orchestration tick ────────────────────────────────────────────

/**
 * The main orchestration tick — called every 30s by the scheduler.
 *
 * Each tick:
 *   1. Telegram orders → enqueue research tasks (source: "telegram")
 *   2. Catch-up: enqueue research for pending claims, summarize for stale stocks
 *   3. Drain the task queue (atomic claim, bounded retries)
 *   4. Send batch Telegram notifications for completed/failed tasks
 */
export async function orchestratorTick(): Promise<OrchestratorTickResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      workDone: false,
      summary: "DEEPSEEK_API_KEY not configured",
      actions: [],
    };
  }

  const telegramConfigured = !!(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
  );

  let workDone = false;
  const actions: string[] = [];

  // ── 1. Check for Telegram orders → enqueue (don't execute) ──────────
  if (telegramConfigured) {
    const commands = await checkForOrders();

    if (commands.length > 0) {
      for (const cmd of commands) {
        // Match command to triage entry by reply_to_message_id
        let pendingRun = null;
        if (cmd.replyToMessageId) {
          const allPending = await prisma.pipelineRun.findMany({
            where: { stage: "triage", status: "started" },
            orderBy: { startedAt: "desc" },
            select: { id: true, output: true },
          });
          pendingRun =
            allPending.find((r) => {
              try {
                const out = JSON.parse(r.output || "{}");
                return out.telegramMessageId === cmd.replyToMessageId;
              } catch {
                return false;
              }
            }) || null;
        }
        if (!pendingRun) {
          pendingRun = await prisma.pipelineRun.findFirst({
            where: { stage: "triage", status: "started" },
            orderBy: { startedAt: "desc" },
            select: { id: true, output: true },
          });
        }

        let pendingClaims: { index: number; claimId: number }[] = [];
        if (pendingRun?.output) {
          try {
            pendingClaims = JSON.parse(pendingRun.output).pendingClaims || [];
          } catch {
            /* ignore */
          }
        }

        const parsed = parseResearchCommand(cmd.command, pendingClaims);

        if (parsed.action === "skip") {
          actions.push("Telegram: user skipped");
          if (pendingRun) {
            await prisma.pipelineRun.update({
              where: { id: pendingRun.id },
              data: { status: "skipped", completedAt: new Date() },
            });
          }
          void sendMessage("👍 Skipped.").catch(() => {});
          workDone = true;
          continue;
        }

        if (parsed.action === "review") {
          // Digest of claims awaiting a human verdict — points to /review.
          // The human is the researcher; the agents never auto-resolve these.
          const [counts, topClaims] = await Promise.all([
            prisma.claim.groupBy({
              by: ["status"],
              _count: { status: true },
              where: { status: { in: ["disputed", "refuted", "unverified"] } },
            }),
            prisma.claim.findMany({
              where: { status: { in: ["disputed", "refuted", "unverified"] } },
              orderBy: [
                { impactScore: { sort: "desc", nulls: "last" } },
                { createdAt: "desc" },
              ],
              take: 3,
              select: {
                id: true,
                text: true,
                impactScore: true,
                stock: { select: { ticker: true } },
              },
            }),
          ]);
          const byStatus = Object.fromEntries(
            counts.map((c) => [c.status, c._count.status])
          );
          const digest = [
            `📋 *Claims Review* — ⚔️ ${byStatus.disputed || 0} disputed · ❌ ${byStatus.refuted || 0} refuted · ⏳ ${byStatus.unverified || 0} unverified`,
            ``,
            ...(topClaims.length > 0
              ? [
                  `Top priority:`,
                  ...topClaims.map(
                    (c, i) =>
                      `${i + 1}. $${c.stock.ticker} (impact ${c.impactScore ?? "?"}) — ${c.text.slice(0, 70)}`
                  ),
                  ``,
                ]
              : [`Nothing awaiting review 🎉`, ``]),
            `Complete the research yourself on the Review page.`,
          ].join("\n");
          void sendMessage(digest).catch(() => {});
          if (pendingRun) {
            await prisma.pipelineRun.update({
              where: { id: pendingRun.id },
              data: {
                status: "skipped",
                completedAt: new Date(),
                decision: "User requested review digest",
              },
            });
          }
          actions.push("Telegram: sent review digest");
          workDone = true;
          continue;
        }

        if (parsed.claimIds.length > 0) {
          const depthLabel = parsed.depth === "deep" ? "deep" : "quick";

          // Enqueue each claim as a task (instead of executing inline).
          // The drain below will pick them up and run through the retry pipeline.
          let enqueued = 0;
          for (const claimId of parsed.claimIds) {
            const claim = await prisma.claim.findUnique({
              where: { id: claimId },
              select: { stock: { select: { ticker: true } } },
            });
            if (!claim) continue;
            await enqueueTask({
              kind: "research",
              claimId,
              ticker: claim.stock.ticker,
              source: "telegram",
              depth: parsed.depth,
            });
            enqueued++;
          }

          actions.push(
            `Telegram: enqueued ${enqueued} research tasks (${depthLabel})`
          );

          // For deep research, also enqueue through the drain (the enqueue just
          // queues; actual deep mode is handled by the research handler).
          // Mark triage as acknowledged.
          if (pendingRun) {
            await prisma.pipelineRun.update({
              where: { id: pendingRun.id },
              data: { status: "completed", completedAt: new Date() },
            });
          }

          void sendMessage(
            `👀 Queued ${enqueued} claim(s) for research (${depthLabel}). Will update when done.`
          ).catch(() => {});
          workDone = true;
        }
      }
    }
  }

  // ── 1b. Expire triage runs awaiting Telegram replies ────────────────
  // Every new-tweet prompt logs a triage run that only completes on a user
  // reply. Unanswered ones must not pile up: after 6h, mark skipped and
  // auto-enqueue deep research for the high-impact claims that were waiting
  // on human review (low-impact ones are covered by the catch-up below).
  // (Ops has a 48h backstop, but ops only runs when watchdog finds issues —
  // this sweep runs every tick regardless.)
  const TRIAGE_EXPIRY_MS = 6 * 60 * 60 * 1000;
  const expiredTriage = await prisma.pipelineRun.findMany({
    where: {
      stage: "triage",
      status: "started",
      startedAt: { lte: new Date(Date.now() - TRIAGE_EXPIRY_MS) },
    },
    select: { id: true, output: true },
  });
  for (const run of expiredTriage) {
    let pendingClaims: { index: number; claimId: number }[] = [];
    try {
      pendingClaims = JSON.parse(run.output || "{}").pendingClaims || [];
    } catch {
      /* ignore malformed output */
    }
    const ids = pendingClaims.map((c) => c.claimId).filter(Boolean);
    if (ids.length > 0) {
      const waiting = await prisma.claim.findMany({
        where: { id: { in: ids }, researchStatus: { in: ["pending", "failed"] } },
        select: { id: true, impactScore: true, stock: { select: { ticker: true } } },
      });
      for (const c of waiting) {
        if ((c.impactScore ?? 0) >= 4 && c.stock?.ticker) {
          await enqueueTask({
            kind: "research",
            claimId: c.id,
            ticker: c.stock.ticker,
            source: "scheduler",
            depth: "deep",
          });
        }
      }
    }
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: "skipped",
        completedAt: new Date(),
        decision:
          "Triage expired (no reply in 6h) — auto-enqueued deep research for high-impact claims",
      },
    });
    actions.push(`Triage expired: ${pendingClaims.length} claim(s) awaiting reply, auto-researched`);
    workDone = true;
  }

  // ── 2. Catch-up: enqueue pending work ───────────────────────────────
  if (!workDone) {
    // 2a. Research for pending claims (low-impact when Telegram configured;
    //     high-impact waits for Telegram review).
    const researchWhere: { researchStatus: { in: string[] }; OR?: any[] } = {
      researchStatus: { in: ["pending", "failed"] },
    };
    if (telegramConfigured) {
      researchWhere.OR = [{ impactScore: { lte: 3 } }, { impactScore: null }];
    }
    const pendingResearch = await prisma.claim.findMany({
      where: researchWhere,
      select: { id: true, stock: { select: { ticker: true } } },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    for (const c of pendingResearch) {
      await enqueueTask({
        kind: "research",
        claimId: c.id,
        ticker: c.stock.ticker,
        source: "scheduler",
        depth: "deep",
      });
    }

    // 2b. Summarize for stale stocks with content.
    //     Priority 1: stocks whose claims changed recently (human verdicts on
    //     /review, re-research) — those must reach the AI memory promptly.
    //     Without this, a stock summarized an hour ago queues behind 200+
    //     older summaries (the 100-stock scan window + 3-per-tick cap) and the
    //     verdict would take hours to propagate.
    const SELECT_STOCK = {
      ticker: true,
      lastSummaryAt: true,
      files: { select: { createdAt: true, markdown: true } },
      notes: { select: { createdAt: true } },
      claims: { select: { createdAt: true, updatedAt: true } },
    } as const;

    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentClaimStocks = await prisma.claim.findMany({
      where: { updatedAt: { gte: recentCutoff } },
      distinct: ["stockId"],
      select: { stockId: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    const recentIds = recentClaimStocks.map((c) => c.stockId);
    const recentStocks =
      recentIds.length > 0
        ? await prisma.stock.findMany({
            where: { id: { in: recentIds } },
            select: SELECT_STOCK,
          })
        : [];

    const stocksToCheck = await prisma.stock.findMany({
      select: SELECT_STOCK,
      orderBy: { lastSummaryAt: "asc" },
      take: 100,
    });

    // Recent-claim stocks first (deduped), then the long tail.
    const seen = new Set<string>();
    const stale = [...recentStocks, ...stocksToCheck].filter((s) => {
      if (seen.has(s.ticker)) return false;
      seen.add(s.ticker);
      return needsSummary(s);
    });
    const actionable = stale.filter(
      (s) =>
        s.claims.length > 0 ||
        s.notes.length > 0 ||
        s.files.some((f) => f.markdown)
    );

    let enqueued = 0;
    for (const s of actionable.slice(0, 3)) {
      if (!(await hasPendingTask("summarize", s.ticker))) {
        await enqueueTask({
          kind: "summarize",
          ticker: s.ticker,
          source: "scheduler",
        });
        actions.push(`Queued summary: $${s.ticker}`);
        enqueued++;
      }
    }

    // 2c. Drain the task queue (research, summarize, extract, narrative, decision).
    const drained = await drainPendingTasks(apiKey, taskHandlers, 5);
    actions.push(...drained.actions);

    // 2d. Send batch Telegram notification for completed/failed tasks.
    if (drained.notifications.length > 0) {
      void notifyBatchComplete(drained.notifications);
    }

    if (enqueued > 0 || drained.ran > 0) workDone = true;
  }

  // ── 3. Log every tick ───────────────────────────────────────────────
  await logPipelineRun({
    stage: "orchestrate",
    status: "completed",
    decision: workDone ? actions.join("; ") : "Tick — nothing to do",
  });

  return {
    workDone,
    summary: workDone ? actions.join("; ") : "Nothing to do",
    actions,
  };
}
