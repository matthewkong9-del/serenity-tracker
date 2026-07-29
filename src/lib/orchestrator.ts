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

// ── Types ──────────────────────────────────────────────────────────────

export interface OrchestratorTickResult {
  workDone: boolean;
  summary: string;
  actions: string[];
}

// ── In-memory tracking ────────────────────────────────────────────────

/** Last-run timestamps for periodic agents. Shared with scheduler.ts. */
export const lastRun: Record<string, number> = {
  watchdogDeep: 0,
  ops: 0,
  ingest: 0,
  price: 0,
  auditor: 0,
  editor: 0,
  cleanup: 0,
};

// ── Schedule helpers ───────────────────────────────────────────────────

export function shouldRun(key: string, intervalMs: number): boolean {
  return Date.now() - lastRun[key] >= intervalMs;
}

export function isHourWindow(hour: number, key: string): boolean {
  const now = new Date();
  return (
    now.getUTCHours() === hour &&
    shouldRun(key, 23 * 60 * 60 * 1000)
  );
}

export function isSunday(): boolean {
  return new Date().getUTCDay() === 0;
}

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

  // ── 2. Auto-research pending claims ──
  // When Telegram IS configured: only auto-research low-impact claims
  // (score ≤ 3 or null). High-impact claims (score ≥ 4) are escalated
  // to Telegram for human review — don't touch them here.
  // When Telegram is NOT configured: auto-research everything.
  const researchFilter: any = {
    status: "unverified",
    researchStatus: { in: ["pending", "failed"] },
  };

  if (telegramConfigured) {
    // Exclude high-impact claims — those wait for human Telegram review
    researchFilter.OR = [
      { impactScore: { lte: 3 } },
      { impactScore: null },
    ];
  }

  if (!workDone) {
    const pendingCount = await prisma.claim.count({ where: researchFilter });

    if (pendingCount > 0) {
      const claims = await prisma.claim.findMany({
        where: researchFilter,
        include: { stock: { select: { ticker: true } } },
        orderBy: { createdAt: "asc" },
        take: 3,
      });

      for (const c of claims) {
        try {
          await researchClaim(c.id, c.stock.ticker, apiKey, "quick");
          actions.push(`Research: claim #${c.id} (${c.stock.ticker})`);
          workDone = true;
        } catch (e: any) {
          console.error(
            `[orchestrator] research claim #${c.id} failed: ${e.message}`
          );
        }
      }
    }
  }

  // ── 3. Summarize stocks with new data ────────────────────────────────
  if (!workDone) {
    const stocksToCheck = await prisma.stock.findMany({
      select: {
        ticker: true,
        lastSummaryAt: true,
        files: { select: { createdAt: true } },
        notes: { select: { createdAt: true } },
        claims: { select: { createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const stale = stocksToCheck.filter((s) => needsSummary(s));
    if (stale.length > 0) {
      const s = stale[0];
      try {
        await summarizeStock(s.ticker, apiKey);
        actions.push(`Summary: $${s.ticker}`);
        workDone = true;

        void runExtractions(s.ticker, apiKey).catch((e) =>
          console.error(
            `[orchestrator] relationships for ${s.ticker} failed: ${e.message}`
          )
        );
        void generateNarrative(s.ticker, apiKey).catch((e) =>
          console.error(
            `[orchestrator] narrative for ${s.ticker} failed: ${e.message}`
          )
        );
      } catch (e: any) {
        if (
          e.message !== "No content to summarize. Add tweets, files, or notes first."
        ) {
          console.error(
            `[orchestrator] summarize ${s.ticker} failed: ${e.message}`
          );
        }
      }
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
