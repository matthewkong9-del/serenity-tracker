/**
 * Core orchestration business logic.
 *
 * Contains the main orchestratorTick() function that the scheduler calls
 * every 30s, plus schedule helpers shared with scheduler.ts.
 *
 * Individual agent logic has been extracted into src/agents/<name>.ts
 * behind a shared Agent interface. The scheduler dispatches through
 * the agent registry instead of calling functions here directly.
 */

import { prisma } from "@/lib/db";
import { researchClaim } from "@/lib/research";
import { summarizeStock, needsSummary } from "@/lib/summarize";
import { generateNarrative } from "@/lib/narrative";
import { runExtractions } from "@/lib/relationships";
import { checkForOrders, parseResearchCommand, sendMessage } from "@/lib/telegram";
import { logPipelineRun } from "@/lib/pipeline-log";
import {
  drainPendingTasks,
  enqueueTask,
  hasPendingTask,
  type TaskHandlers,
} from "@/lib/pending-tasks";

// ── Types ──────────────────────────────────────────────────────────────

export interface OrchestratorTickResult {
  workDone: boolean;
  summary: string;
  actions: string[];
}

// ── Schedule state (persisted via ScheduleState, survives restarts) ────────

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

// ── Task handlers for the drain (injected into drainPendingTasks) ──────────

const taskHandlers: TaskHandlers = {
  research: async (claimId, ticker, apiKey) => {
    await researchClaim(claimId, ticker, apiKey, "quick");
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
};

// ── Core orchestration tick ────────────────────────────────────────────

/**
 * The main orchestration tick — called every 30s by the scheduler.
 * Also callable directly via the API route for manual triggers.
 *
 * Each tick does at most ONE batch of work:
 *   1. Telegram orders (if configured)
 *   2. Auto-research pending claims (when no Telegram)
 *   3. Summarize one stale stock
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

  // ── 1. Check for Telegram orders ────────────────────────────────────
  if (telegramConfigured) {
    const commands = await checkForOrders();

    if (commands.length > 0) {
      for (const cmd of commands) {
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

        if (parsed.action === "research" && parsed.claimIds.length === 0) {
          const allPending = await prisma.claim.findMany({
            where: {
              status: "unverified",
              researchStatus: { in: ["pending", "failed"] },
            },
            select: { id: true },
            orderBy: { createdAt: "asc" },
          });
          if (allPending.length > 0) {
            parsed.claimIds = allPending.map((c) => c.id);
            void sendMessage(
              `⚠️ Couldn't match your reply to a specific notification. Researching all ${allPending.length} pending claims instead.`
            ).catch(() => {});
          }
        }

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

        if (parsed.claimIds.length > 0) {
          const depthLabel = parsed.depth === "deep" ? "deep" : "quick";
          void sendMessage(
            `👀 On it — researching ${parsed.claimIds.length} claim(s) (${depthLabel})…`
          ).catch(() => {});

          let researched = 0;
          for (const claimId of parsed.claimIds) {
            const claim = await prisma.claim.findUnique({
              where: { id: claimId },
              select: { stock: { select: { ticker: true } } },
            });
            if (!claim) continue;
            try {
              await researchClaim(claimId, claim.stock.ticker, apiKey, parsed.depth);
              researched++;
            } catch (e: any) {
              console.error(
                `[orchestrator] research claim #${claimId} failed: ${e.message}`
              );
            }
          }

          actions.push(`Telegram: researched ${researched} claims (${depthLabel})`);

          if (pendingRun) {
            await prisma.pipelineRun.update({
              where: { id: pendingRun.id },
              data: { status: "completed", completedAt: new Date() },
            });
          }

          void sendMessage(
            `✅ Done — researched ${researched} claim(s) (${depthLabel}).`
          ).catch(() => {});
          workDone = true;
        }
      }
    }
  }

  // ── 2. Catch-up + drain the persisted task queue ────────────────────
  // Reactivity is event-driven (enqueueTask); this is the safety net that
  // also recovers work events can't see (a file uploaded directly) or that
  // was lost to a restart. The drain's atomic claim guarantees no two ticks
  // run the same stock's work at once — this stops the concurrent
  // summarize/relationship collisions that caused the watchdog→ops timeout
  // loop. (ADR-0001)
  if (!workDone) {
    // 2a. Enqueue research for pending claims (safety net — sync already
    // enqueues for newly-extracted claims). Low-impact auto-researches;
    // high-impact waits for Telegram review when configured. Dedup in
    // enqueueTask means re-enqueuing an already-pending task is a no-op.
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
      await enqueueTask({ kind: "research", claimId: c.id, ticker: c.stock.ticker });
    }

    // 2b. Enqueue summarize for stocks with new content but no pending task.
    const stocksToCheck = await prisma.stock.findMany({
      select: {
        ticker: true,
        lastSummaryAt: true,
        files: { select: { createdAt: true, markdown: true } },
        notes: { select: { createdAt: true } },
        claims: { select: { createdAt: true, updatedAt: true } },
      },
      orderBy: { lastSummaryAt: "asc" },
      take: 100,
    });

    const stale = stocksToCheck.filter((s) => needsSummary(s));
    // Only enqueue if there's indexable content: claims, notes, or a file
    // that was converted to markdown (matches summarizeStock's buildContext,
    // which ignores files whose markdown is null).
    const actionable = stale.filter(
      (s) =>
        s.claims.length > 0 ||
        s.notes.length > 0 ||
        s.files.some((f) => f.markdown)
    );

    let enqueued = 0;
    for (const s of actionable.slice(0, 3)) {
      if (!(await hasPendingTask("summarize", s.ticker))) {
        await enqueueTask({ kind: "summarize", ticker: s.ticker });
        actions.push(`Queued summary: $${s.ticker}`);
        enqueued++;
      }
    }

    // 2b. Drain due research/summarize/extract/narrative tasks.
    const drained = await drainPendingTasks(apiKey, taskHandlers, 5);
    actions.push(...drained.actions);
    if (enqueued > 0 || drained.ran > 0) workDone = true;
  }

  // ── 3. Stale-research refresh (daily at 5 AM UTC) ───────────────────
  // Re-queue claims whose verdicts have gone stale so the AI's authoritative
  // status stays current. Capped (20/day) + impact-prioritized.
  if (isHourWindow(5, "staleResearch")) {
    await markRun("staleResearch");
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const staleClaims = await prisma.claim.findMany({
      where: { researchStatus: "done", researchedAt: { lt: cutoff } },
      select: { id: true, stock: { select: { ticker: true } } },
      orderBy: { impactScore: "desc" },
      take: 20,
    });
    for (const c of staleClaims) {
      await enqueueTask({ kind: "research", claimId: c.id, ticker: c.stock.ticker });
    }
    if (staleClaims.length > 0) {
      actions.push(`Stale research: queued ${staleClaims.length}`);
    }
  }

  // ── Log every tick ───────────────────────────────────────────────────
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
