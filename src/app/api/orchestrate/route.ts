import { prisma } from "@/lib/db";
import { researchClaim, researchNewClaims } from "@/lib/research";
import { summarizeStock, needsSummary } from "@/lib/summarize";
import { generateNarrative } from "@/lib/narrative";
import { runExtractions } from "@/lib/relationships";
import { checkForOrders, parseResearchCommand, sendMessage } from "@/lib/telegram";
import { logPipelineRun } from "@/lib/pipeline-log";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/orchestrate
 *
 * The brain of the autonomous pipeline. Called every ~30s by the PM2
 * orchestrator heartbeat (scripts/orchestrator.js). Each tick checks:
 *
 *   1. Telegram orders — did the user send a command?
 *   2. Pending research — any claims waiting for verification?
 *   3. Stale summaries — any stocks with new data since last summary?
 *   4. Stale relationships — any stocks missing their relationship map?
 *
 * Each tick does at most ONE batch of work to keep latency low and
 * avoid overlapping runs. The PM2 script enforces mutual exclusion.
 */
export async function POST(req: NextRequest) {
  // Simple token check so only the orchestrator can call this
  const token = process.env.ORCHESTRATOR_TOKEN;
  if (token) {
    const sent = req.headers.get("x-orchestrator-token");
    if (sent !== token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured" },
      { status: 500 }
    );
  }

  const telegramConfigured = !!(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID
  );

  let workDone = false;
  const actions: string[] = [];

  // ── 1. Check for Telegram orders ──────────────────────────────────────
  if (telegramConfigured) {
    const commands = await checkForOrders();

    if (commands.length > 0) {
      for (const cmd of commands) {
        // Find the triage entry this command is replying to, or fall back to
        // the latest pending triage if it's a standalone message (no reply).
        let pendingRun = null;
        if (cmd.replyToMessageId) {
          // Match by Telegram message_id — user replied to a specific notification
          const allPending = await prisma.pipelineRun.findMany({
            where: { stage: "triage", status: "started" },
            orderBy: { startedAt: "desc" },
            select: { id: true, output: true },
          });
          pendingRun = allPending.find((r) => {
            try {
              const out = JSON.parse(r.output || "{}");
              return out.telegramMessageId === cmd.replyToMessageId;
            } catch {
              return false;
            }
          }) || null;
        }
        if (!pendingRun) {
          // Fallback: standalone command → use latest pending triage
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
          } catch { /* ignore */ }
        }

        const parsed = parseResearchCommand(cmd.command, pendingClaims);

        // Fallback: if no triage entry matched (user replied to old notification,
        // or sent a standalone command), research ALL pending claims
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
            void sendMessage(`⚠️ Couldn't match your reply to a specific notification. Researching all ${allPending.length} pending claims instead.`).catch(() => {});
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
          void sendMessage(`👍 Skipped.`).catch(() => {});
          workDone = true;
          continue;
        }

        if (parsed.claimIds.length > 0) {
          // Acknowledge immediately so the user knows the command was received
          const depthLabel = parsed.depth === "deep" ? "deep" : "quick";
          void sendMessage(`👀 On it — researching ${parsed.claimIds.length} claim(s) (${depthLabel})…`).catch(() => {});

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
              console.error(`[orchestrate] research claim #${claimId} failed: ${e.message}`);
            }
          }

          actions.push(`Telegram: researched ${researched} claims (${depthLabel})`);

          if (pendingRun) {
            await prisma.pipelineRun.update({
              where: { id: pendingRun.id },
              data: { status: "completed", completedAt: new Date() },
            });
          }

          void sendMessage(`✅ Done — researched ${researched} claim(s) (${depthLabel}).`).catch(() => {});
          workDone = true;
        }
      }
    }
  }

  // ── 2. Auto-research pending claims (only when Telegram is NOT configured) ──
  if (!telegramConfigured) {
    const pendingCount = await prisma.claim.count({
      where: {
        status: "unverified",
        researchStatus: { in: ["pending", "failed"] },
      },
    });

    if (pendingCount > 0) {
      // Process a small batch per tick to avoid runaway costs
      const claims = await prisma.claim.findMany({
        where: {
          status: "unverified",
          researchStatus: { in: ["pending", "failed"] },
        },
        include: { stock: { select: { ticker: true } } },
        orderBy: { createdAt: "asc" },
        take: 3, // small batch per tick
      });

      for (const c of claims) {
        try {
          await researchClaim(c.id, c.stock.ticker, apiKey, "quick");
          actions.push(`Research: claim #${c.id} (${c.stock.ticker})`);
          workDone = true;
        } catch (e: any) {
          console.error(`[orchestrate] research claim #${c.id} failed: ${e.message}`);
        }
      }
    }
  }

  // ── 3. Summarize stocks with new data ──────────────────────────────────
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
      // Summarize just one per tick to keep costs predictable
      const s = stale[0];
      try {
        await summarizeStock(s.ticker, apiKey);
        actions.push(`Summary: $${s.ticker}`);
        workDone = true;

        // After summary, trigger relationship extraction + narrative
        void runExtractions(s.ticker, apiKey).catch((e) =>
          console.error(`[orchestrate] relationships for ${s.ticker} failed: ${e.message}`)
        );
        void generateNarrative(s.ticker, apiKey).catch((e) =>
          console.error(`[orchestrate] narrative for ${s.ticker} failed: ${e.message}`)
        );
      } catch (e: any) {
        if (e.message !== "No content to summarize. Add tweets, files, or notes first.") {
          console.error(`[orchestrate] summarize ${s.ticker} failed: ${e.message}`);
        }
      }
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────
  // Log every tick so the agents page knows the orchestrator is alive
  await logPipelineRun({
    stage: "orchestrate",
    status: "completed",
    decision: workDone ? actions.join("; ") : "Tick — nothing to do",
  });

  return NextResponse.json({
    workDone,
    summary: workDone ? actions.join("; ") : "Nothing to do",
    actions,
  });
}
