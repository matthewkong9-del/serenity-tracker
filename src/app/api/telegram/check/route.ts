import { prisma } from "@/lib/db";
import { researchClaim } from "@/lib/research";
import { checkForOrders, parseResearchCommand, sendMessage } from "@/lib/telegram";
import { logPipelineRun } from "@/lib/pipeline-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/check
 *
 * Polls Telegram for new messages from the user, parses commands, and
 * executes research orders. Called by cron or manually.
 *
 * No request body needed. Returns what was processed.
 */
export async function POST() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not configured" }, { status: 500 });
  }

  // 1. Check for new messages from the user
  const commands = await checkForOrders();

  if (commands.length === 0) {
    return NextResponse.json({ processed: 0, message: "No new commands" });
  }

  // 2. Find the most recent pending triage batch (index → claimId mapping)
  const pendingRun = await prisma.pipelineRun.findFirst({
    where: { stage: "triage", status: "started" },
    orderBy: { startedAt: "desc" },
    select: { id: true, output: true },
  });

  let pendingClaims: { index: number; claimId: number; ticker: string }[] = [];

  if (pendingRun?.output) {
    try {
      const parsed = JSON.parse(pendingRun.output);
      pendingClaims = parsed.pendingClaims || [];
    } catch {
      // output not parseable — can't map indices
    }
  }

  const results: string[] = [];

  for (const command of commands) {
    const parsed = parseResearchCommand(command, pendingClaims);

    if (parsed.action === "skip") {
      results.push("Skipped all claims.");
      if (pendingRun) {
        await logPipelineRun({
          stage: "triage",
          status: "skipped",
          decision: "User skipped — no research ordered.",
        });
        await prisma.pipelineRun.update({
          where: { id: pendingRun.id },
          data: { status: "skipped", completedAt: new Date() },
        });
      }
      continue;
    }

    if (parsed.claimIds.length === 0) {
      results.push(`No valid claim indices found in: "${command}"`);
      continue;
    }

    // 3. Execute research for each requested claim
    let researched = 0;
    let failed = 0;

    for (const claimId of parsed.claimIds) {
      const claim = await prisma.claim.findUnique({
        where: { id: claimId },
        select: { stock: { select: { ticker: true } } },
      });
      if (!claim) {
        failed++;
        continue;
      }

      try {
        await researchClaim(claimId, claim.stock.ticker, apiKey, parsed.depth);
        researched++;
      } catch (e: any) {
        console.error(`[telegram] research claim #${claimId} failed: ${e.message}`);
        failed++;
      }
    }

    // 4. Mark the triage batch as completed
    if (pendingRun) {
      await prisma.pipelineRun.update({
        where: { id: pendingRun.id },
        data: { status: "completed", completedAt: new Date() },
      });
    }

    const depthLabel = parsed.depth === "deep" ? "adversarial" : "quick";
    results.push(
      `Researched ${researched} claim(s) (${depthLabel})` +
        (failed > 0 ? `, ${failed} failed.` : ".")
    );
  }

  // 5. Send confirmation back to the user
  const reply = results.join("\n");
  void sendMessage(`✅ Done.\n\n${reply}`).catch(() => {});

  return NextResponse.json({ processed: commands.length, results });
}
