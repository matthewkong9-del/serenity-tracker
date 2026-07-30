/**
 * Persisted work queue — the single reactivity plane (ADR-0001).
 *
 * Replaces the in-memory EventEmitter + setTimeout debounce. Any module that
 * wants "do X to ticker Y after a change" calls enqueueTask(); the
 * orchestrator's 30s tick drains due rows. Because work is persisted, a
 * process restart no longer loses pending re-summarizations, and the atomic
 * claim guarantees two ticks never run the same stock's work at once.
 *
 * Modeled on src/lib/market-data.ts: pure helpers (backoff, dedup key) are
 * separable from the DB-touching operations, so the schedule logic is testable.
 */

import { prisma } from "@/lib/db";
import { logPipelineRun, completePipelineRun, type PipelineStage } from "@/lib/pipeline-log";
import { sendMessage } from "@/lib/telegram";

// ── Types ───────────────────────────────────────────────────────────────────

export type TaskKind = "research" | "summarize" | "extract" | "narrative" | "decision";

export type TaskSource = "telegram" | "scheduler" | "manual";

export interface EnqueueInput {
  kind: TaskKind;
  ticker?: string;
  claimId?: number;
  source?: TaskSource;
  /** When the task becomes eligible to run. Defaults to now. */
  dueAt?: Date;
}

/** Injected execution handlers — keeps this module free of imports of the
 *  research/summarize/etc. modules (no cycles) and lets tests pass fakes,
 *  the same way market-data.ts takes injected price sources. */
export interface TaskHandlers {
  research: (claimId: number, ticker: string, apiKey: string) => Promise<void>;
  summarize: (ticker: string, apiKey: string) => Promise<void>;
  extract: (ticker: string, apiKey: string) => Promise<void>;
  narrative: (ticker: string, apiKey: string) => Promise<void>;
  decision: (ticker: string, apiKey: string) => Promise<void>;
}

export const MAX_ATTEMPTS = 3;

const TASK_KIND_TO_STAGE: Record<TaskKind, PipelineStage> = {
  research: "research",
  summarize: "summarize",
  extract: "relationship",
  narrative: "narrative",
  decision: "decision",
};

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Backoff in ms for the Nth retry (attempt is 1-based: first failure → 1). */
export function backoffMs(attempt: number): number {
  // 30s → 2min → 10min
  const table = [30_000, 120_000, 600_000];
  return table[Math.min(attempt - 1, table.length - 1)] ?? 600_000;
}

/** research tasks dedup on claimId; everything else on ticker. */
function dedupFilter(input: EnqueueInput) {
  if (input.kind === "research" && input.claimId != null) {
    return { kind: input.kind, claimId: input.claimId, status: "pending" as const };
  }
  return { kind: input.kind, ticker: input.ticker ?? null, status: "pending" as const };
}

// ── Enqueue (dedup + debounce) ──────────────────────────────────────────────

/**
 * Queue a unit of work. If a `pending` task of the same kind+ticker (or
 * kind+claimId) already exists, its `dueAt` is moved out (debounce) instead of
 * inserting a duplicate. A `claimed` (running) task is NOT deduped against — a
 * fresh pending row is inserted so the work runs again after the current run,
 * picking up the newer data.
 */
export async function enqueueTask(input: EnqueueInput): Promise<void> {
  const dueAt = input.dueAt ?? new Date();

  const existing = await prisma.pendingTask.findFirst({
    where: dedupFilter(input),
    orderBy: { dueAt: "asc" },
    select: { id: true },
  });

  if (existing) {
    await prisma.pendingTask.update({
      where: { id: existing.id },
      data: { dueAt, source: input.source ?? null },
    });
    return;
  }

  await prisma.pendingTask.create({
    data: {
      kind: input.kind,
      ticker: input.ticker ?? null,
      claimId: input.claimId ?? null,
      source: input.source ?? null,
      status: "pending",
      dueAt,
    },
  });
}

/** True if a ticker has a pending or claimed task of the given kind. */
export async function hasPendingTask(kind: TaskKind, ticker: string): Promise<boolean> {
  const row = await prisma.pendingTask.findFirst({
    where: { kind, ticker, status: { in: ["pending", "claimed"] } },
    select: { id: true },
  });
  return row != null;
}

// ── Claim / complete / fail ─────────────────────────────────────────────────

/**
 * Atomically claim up to `limit` due tasks so two ticks never run the same
 * work. Safe under the single-drainer design (orchestratorTick, guarded by
 * scheduler.__s.running); the status filter makes a concurrent claim idempotent.
 */
async function claimDueTasks(limit: number) {
  const tasks = await prisma.pendingTask.findMany({
    where: { status: "pending", dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: limit,
  });
  if (tasks.length === 0) return [];
  await prisma.pendingTask.updateMany({
    where: { id: { in: tasks.map((t) => t.id) }, status: "pending" },
    data: { status: "claimed" },
  });
  return tasks;
}

async function completeTask(id: number): Promise<void> {
  await prisma.pendingTask.update({ where: { id }, data: { status: "done" } });
}

/**
 * Record a failure: bump attempts, schedule a backoff retry, or mark dead.
 * Returns the new status ("pending" | "dead") and the task's kind + ticker for notification.
 */
export async function failTask(
  id: number,
  error: string
): Promise<{ status: "pending" | "dead"; kind: string; ticker: string | null }> {
  const task = await prisma.pendingTask.findUnique({
    where: { id },
    select: { attempts: true, kind: true, ticker: true },
  });
  const attempts = (task?.attempts ?? 0) + 1;

  if (attempts >= MAX_ATTEMPTS) {
    await prisma.pendingTask.update({
      where: { id },
      data: { status: "dead", attempts, lastError: error.slice(0, 1000) },
    });
    return { status: "dead", kind: task?.kind ?? "unknown", ticker: task?.ticker ?? null };
  }

  await prisma.pendingTask.update({
    where: { id },
    data: {
      status: "pending",
      attempts,
      dueAt: new Date(Date.now() + backoffMs(attempts)),
      lastError: error.slice(0, 1000),
    },
  });
  return { status: "pending", kind: task?.kind ?? "unknown", ticker: task?.ticker ?? null };
}

// ── Dispatch ────────────────────────────────────────────────────────────────

async function dispatch(
  task: { id: number; kind: string; ticker: string | null; claimId: number | null; attempts: number },
  apiKey: string,
  handlers: TaskHandlers
): Promise<void> {
  switch (task.kind) {
    case "research": {
      if (task.claimId == null || !task.ticker) {
        throw new Error("research task missing claimId/ticker");
      }
      // researchClaim catches its own errors and sets researchStatus="failed",
      // so it does not throw. Detect success/failure via the claim's state.
      await handlers.research(task.claimId, task.ticker, apiKey);
      const claim = await prisma.claim.findUnique({
        where: { id: task.claimId },
        select: { researchStatus: true },
      });
      if (claim?.researchStatus !== "done") {
        throw new Error(`research did not complete (researchStatus=${claim?.researchStatus})`);
      }
      break;
    }
    case "summarize": {
      if (!task.ticker) throw new Error("summarize task missing ticker");
      await handlers.summarize(task.ticker, apiKey);
      break;
    }
    case "extract": {
      if (!task.ticker) throw new Error("extract task missing ticker");
      await handlers.extract(task.ticker, apiKey);
      break;
    }
    case "narrative": {
      if (!task.ticker) throw new Error("narrative task missing ticker");
      await handlers.narrative(task.ticker, apiKey);
      break;
    }
    case "decision": {
      if (!task.ticker) throw new Error("decision task missing ticker");
      await handlers.decision(task.ticker, apiKey);
      break;
    }
    default:
      throw new Error(`unknown task kind: ${task.kind}`);
  }
}

// ── Drain (called by orchestratorTick) ──────────────────────────────────────

export interface DrainResult {
  ran: number;
  succeeded: number;
  failed: number;
  dead: number;
  actions: string[];
  /** Telegram notifications to send after drain completes */
  notifications: { ticker: string; kind: string; ok: boolean; error?: string }[];
}

/**
 * Claim and run up to `limit` due tasks. Each task is logged as a PipelineRun
 * for observability. Failures are retried with backoff (failTask); dead tasks
 * are surfaced. For a dead *research* task, the claim is marked
 * researchStatus="dead" so it stops being re-queued.
 */
export async function drainPendingTasks(
  apiKey: string,
  handlers: TaskHandlers,
  limit = 5
): Promise<DrainResult> {
  const tasks = await claimDueTasks(limit);
  const actions: string[] = [];
  const notifications: DrainResult["notifications"] = [];
  let succeeded = 0;
  let failed = 0;
  let dead = 0;

  for (const task of tasks) {
    const stage = TASK_KIND_TO_STAGE[task.kind as TaskKind] ?? "orchestrate";
    const runId = await logPipelineRun({
      stage,
      status: "started",
      stockTicker: task.ticker,
      claimId: task.claimId,
      input: { attempts: task.attempts, kind: task.kind, source: (task as any).source },
    });

    try {
      await dispatch(task, apiKey, handlers);
      await completeTask(task.id);
      if (runId) await completePipelineRun(runId, { status: "completed", decision: `${task.kind} done` });
      succeeded++;
      actions.push(`${task.kind}: ${task.ticker ?? `claim#${task.claimId}`}`);

      // Telegram notification for telegram-sourced tasks
      const source = (task as any).source;
      if (source === "telegram" && task.ticker) {
        notifications.push({ ticker: task.ticker, kind: task.kind, ok: true });
      }

      // Chain: summarize → enqueue extract + narrative
      if (task.kind === "summarize" && task.ticker) {
        void enqueueTask({ kind: "extract", ticker: task.ticker, source: "scheduler" });
        void enqueueTask({ kind: "narrative", ticker: task.ticker, source: "scheduler" });
      }
    } catch (e: any) {
      const msg = e?.message?.slice(0, 500) || "Unknown error";

      // "No content to summarize" is a legitimate no-op (e.g. a stock whose
      // only file wasn't converted to markdown), not a retryable failure.
      if (task.kind === "summarize" && msg.startsWith("No content to summarize")) {
        await completeTask(task.id);
        if (runId) await completePipelineRun(runId, { status: "skipped", decision: "No content — skipped" });
        succeeded++;
        actions.push(`summarize: ${task.ticker} (no content, skipped)`);
        continue;
      }

      const result = await failTask(task.id, msg);
      if (runId) await completePipelineRun(runId, { status: "failed", error: msg });
      if (result.status === "dead") {
        dead++;
        if (task.kind === "research" && task.claimId != null) {
          await prisma.claim
            .update({ where: { id: task.claimId }, data: { researchStatus: "dead" } })
            .catch(() => {});
        }
        // Notify about dead tasks that came from Telegram
        const source = (task as any).source;
        if (source === "telegram" && task.ticker) {
          notifications.push({
            ticker: task.ticker,
            kind: task.kind,
            ok: false,
            error: msg,
          });
        }
      }
      failed++;
    }
  }

  return { ran: tasks.length, succeeded, failed, dead, actions, notifications };
}

// ── Telegram notification helper ────────────────────────────────────────────

/** Send a summary notification after a batch of Telegram-sourced tasks finishes. */
export async function notifyBatchComplete(
  notifications: DrainResult["notifications"]
): Promise<void> {
  if (notifications.length === 0) return;

  const telegramConfigured = !!(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
  );
  if (!telegramConfigured) return;

  const succeeded = notifications.filter((n) => n.ok);
  const failed = notifications.filter((n) => !n.ok);

  const parts: string[] = [];
  if (succeeded.length > 0) {
    const byKind = new Map<string, string[]>();
    for (const n of succeeded) {
      const list = byKind.get(n.kind) || [];
      list.push(`$${n.ticker}`);
      byKind.set(n.kind, list);
    }
    byKind.forEach((tickers, kind) => {
      parts.push(`✅ ${kind}: ${tickers.join(", ")}`);
    });
  }
  if (failed.length > 0) {
    for (const n of failed) {
      parts.push(`❌ ${n.kind} $${n.ticker}: ${n.error?.slice(0, 100) || "failed"}`);
    }
  }

  if (parts.length > 0) {
    await sendMessage(parts.join("\n")).catch(() => {});
  }
}
