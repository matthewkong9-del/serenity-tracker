import { prisma } from "@/lib/db";
import { researchNewClaims } from "@/lib/research";
import { summarizeStock, needsSummary } from "@/lib/summarize";
import { generateNarrative } from "@/lib/narrative";
import { runExtractions } from "@/lib/relationships";
import { logPipelineRun } from "@/lib/pipeline-log";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/agents/trigger
 *
 * Manually triggers an agent job. Body: { agent: "research" | "analysis" | ... }
 * Some agents accept optional params (e.g., ticker for analysis).
 */

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { agent, ticker } = body as { agent?: string; ticker?: string };

  if (!agent) {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }

  try {
    switch (agent) {
      // ── Ingest ──────────────────────────────────────────────────────
      case "ingest": {
        const syncUrl = process.env.SYNC_CSV_URL;
        if (!syncUrl) {
          return NextResponse.json({ error: "SYNC_CSV_URL not configured" }, { status: 400 });
        }
        // Ingest is triggered by sync — call it via localhost to reuse the full pipeline
        const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
        const syncRes = await fetch(`${baseUrl}/api/sync`, { method: "POST" });
        const syncResult = await syncRes.json();
        return NextResponse.json({ ok: syncRes.ok, message: "Ingest (sync) triggered", ...syncResult });
      }

      // ── Research ────────────────────────────────────────────────────
      case "research": {
        const pendingClaims = await prisma.claim.findMany({
          where: {
            status: "unverified",
            researchStatus: { in: ["pending", "failed"] },
          },
          include: { stock: { select: { ticker: true } } },
          orderBy: { createdAt: "asc" },
          take: 5,
        });

        if (pendingClaims.length === 0) {
          return NextResponse.json({ ok: true, message: "No pending claims to research" });
        }

        const tickers = Array.from(new Set(pendingClaims.map((c) => c.stock.ticker)));
        let researched = 0;
        let failed = 0;
        for (const t of tickers) {
          try {
            const result = await researchNewClaims([t], apiKey, "quick");
            researched += result.researched;
            failed += result.failed;
          } catch (e: any) {
            failed++;
            console.error(`[trigger:research] ${t} failed: ${e.message}`);
          }
        }

        return NextResponse.json({
          ok: true,
          message: `Researched ${researched} claims across ${tickers.length} stocks (${failed} failed)`,
        });
      }

      // ── Analysis ────────────────────────────────────────────────────
      case "analysis": {
        if (ticker) {
          // Summarize a specific stock
          await summarizeStock(ticker, apiKey);
          void runExtractions(ticker, apiKey).catch(() => {});
          void generateNarrative(ticker, apiKey).catch(() => {});
          return NextResponse.json({ ok: true, message: `Analyzed $${ticker}` });
        }

        // Find the most stale stock
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
        if (stale.length === 0) {
          return NextResponse.json({ ok: true, message: "All stocks up to date" });
        }

        const s = stale[0];
        await summarizeStock(s.ticker, apiKey);
        void runExtractions(s.ticker, apiKey).catch(() => {});
        void generateNarrative(s.ticker, apiKey).catch(() => {});
        return NextResponse.json({ ok: true, message: `Analyzed $${s.ticker}`, ticker: s.ticker });
      }

      // ── Price ───────────────────────────────────────────────────────
      case "price": {
        const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
        // Fire-and-forget — price refresh takes 5-10 min
        fetch(`${baseUrl}/api/prices/refresh`, { method: "POST" }).catch(() => {});
        return NextResponse.json({
          ok: true,
          message: "Price refresh started (runs in background, ~5-10 min)",
        });
      }

      // ── Scoring ─────────────────────────────────────────────────────
      case "scoring": {
        // Scoring is computed on read — just report current state
        const [withDepth, total] = await Promise.all([
          prisma.stock.count({ where: { chokepointDepth: { not: null } } }),
          prisma.stock.count(),
        ]);

        return NextResponse.json({
          ok: true,
          message: `Scoring is computed live. ${withDepth}/${total} stocks have chokepoint depth. Refresh any page to re-score.`,
        });
      }

      // ── Cleanup ─────────────────────────────────────────────────────
      case "cleanup": {
        const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
        const cleanRes = await fetch(`${baseUrl}/api/cleanup`, { method: "POST" });
        const cleanResult = await cleanRes.json();
        return NextResponse.json({ ok: cleanRes.ok, message: "Cleanup scan triggered", ...cleanResult });
      }

      // ── Watchdog ────────────────────────────────────────────────────
      case "watchdog": {
        // Scan for infrastructure issues right now
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [failed24h, stuck24h, costSpike] = await Promise.all([
          prisma.pipelineRun.count({
            where: {
              status: "failed",
              startedAt: { gte: twentyFourHoursAgo },
              // Exclude runs already handled by Ops — those were stuck runs
              // that ops auto-cleared; watchdog shouldn't re-flag them.
              NOT: { error: { startsWith: "Auto-cleared by Ops" } },
            },
          }),
          prisma.pipelineRun.count({
            where: {
              status: "started",
              startedAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) }, // started >10 min ago
            },
          }),
          // Cost spike: check if last hour > 5x average hourly
          prisma.apiCallLog.aggregate({
            where: { createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
            _sum: { estimatedCost: true },
          }),
        ]);

        const issues: string[] = [];
        if (failed24h > 0) issues.push(`${failed24h} failed pipeline runs in 24h`);
        if (stuck24h > 0) issues.push(`${stuck24h} stuck pipeline runs (>10 min started)`);

        await logPipelineRun({
          stage: "watchdog",
          status: issues.length === 0 ? "completed" : "completed",
          decision: issues.length === 0 ? "All systems healthy" : issues.join("; "),
        });

        return NextResponse.json({
          ok: true,
          message: issues.length === 0 ? "All systems healthy" : issues.join(". "),
          issues,
        });
      }

      // ── Auditor ─────────────────────────────────────────────────────
      case "auditor": {
        // Scan for content quality issues
        const issues: string[] = [];

        // Contradictory claims (disputed)
        const disputed = await prisma.claim.count({ where: { status: "disputed" } });
        if (disputed > 0) issues.push(`${disputed} disputed claims need review`);

        // Stocks with depth >=4 but zero supporting evidence
        const depth4Stocks = await prisma.stock.findMany({
          where: { chokepointDepth: { gte: 4 } },
          select: {
            ticker: true,
            claims: { where: { status: "supported" }, select: { id: true } },
          },
        });

        const unsupportedDepth4 = depth4Stocks.filter((s) => s.claims.length === 0);
        if (unsupportedDepth4.length > 0) {
          issues.push(
            `${unsupportedDepth4.length} depth-4+ stocks with no supporting evidence: ` +
              unsupportedDepth4.map((s) => `$${s.ticker}`).join(", ")
          );
        }

        await logPipelineRun({
          stage: "auditor",
          status: "completed",
          decision: issues.length === 0 ? "All content checks passed" : issues.join("; "),
        });

        return NextResponse.json({
          ok: true,
          message: issues.length === 0 ? "All content checks passed" : issues.join(". "),
          issues,
        });
      }

      // ── Ops (auto-fix infrastructure issues) ───────────────────────
      case "ops": {
        const now = new Date();
        const fixes: string[] = [];

        // 1. Clear stuck PipelineRun entries (started > 15 min ago → failed).
        //    Skip triage — it waits for user input and is NOT a stuck run.
        const stuckCutoff = new Date(now.getTime() - 15 * 60 * 1000);
        const stuck = await prisma.pipelineRun.findMany({
          where: {
            status: "started",
            startedAt: { lte: stuckCutoff },
            stage: { not: "triage" },
          },
          select: { id: true, stage: true, stockTicker: true },
        });

        if (stuck.length > 0) {
          await prisma.pipelineRun.updateMany({
            where: { id: { in: stuck.map((r) => r.id) } },
            data: {
              status: "failed",
              completedAt: now,
              error: "Auto-cleared by Ops: stuck > 15 minutes",
            },
          });
          fixes.push(`Cleared ${stuck.length} stuck pipeline runs`);
        }

        // 1b. Clear abandoned triage entries (user never replied — 48h timeout)
        const triageCutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        const abandonedTriage = await prisma.pipelineRun.findMany({
          where: {
            stage: "triage",
            status: "started",
            startedAt: { lte: triageCutoff },
          },
          select: { id: true },
        });

        if (abandonedTriage.length > 0) {
          await prisma.pipelineRun.updateMany({
            where: { id: { in: abandonedTriage.map((r) => r.id) } },
            data: {
              status: "skipped",
              completedAt: now,
              error: "Auto-skipped by Ops: no user response after 48h",
            },
          });
          fixes.push(`Skipped ${abandonedTriage.length} abandoned triage entries`);
        }

        // 2. Reset researchStatus for claims with failed research
        const failedClaims = await prisma.claim.count({
          where: { researchStatus: "failed" },
        });
        if (failedClaims > 0) {
          await prisma.claim.updateMany({
            where: { researchStatus: "failed" },
            data: { researchStatus: "pending" },
          });
          fixes.push(`Reset ${failedClaims} failed research claims → pending`);
        }

        await logPipelineRun({
          stage: "ops",
          status: "completed",
          decision: fixes.length === 0 ? "Nothing to fix" : fixes.join("; "),
        });

        return NextResponse.json({
          ok: true,
          message: fixes.length === 0 ? "Nothing to fix" : fixes.join(". "),
          fixes,
        });
      }

      // ── Editor (auto-fix content quality issues) ───────────────────
      case "editor": {
        const fixes: string[] = [];

        // 1. Auto-research disputed claims (re-run research to break the tie)
        const disputedClaims = await prisma.claim.findMany({
          where: { status: "disputed" },
          include: { stock: { select: { ticker: true } } },
          take: 5, // small batch per run
        });

        if (disputedClaims.length > 0) {
          const tickers = Array.from(new Set(disputedClaims.map((c) => c.stock.ticker)));
          let researched = 0;
          for (const t of tickers) {
            try {
              const result = await researchNewClaims([t], apiKey, "deep");
              researched += result.researched;
            } catch (e: any) {
              console.error(`[trigger:editor] deep research on ${t} failed: ${e.message}`);
            }
          }
          if (researched > 0) {
            fixes.push(`Deep-researched ${researched} disputed claims across ${tickers.length} stocks`);
          }
        }

        // 2. Flag depth-4 stocks with zero supporting evidence
        const depth4Stocks = await prisma.stock.findMany({
          where: { chokepointDepth: { gte: 4 } },
          select: {
            ticker: true,
            claims: { where: { status: "supported" }, select: { id: true } },
          },
        });

        const unsupported = depth4Stocks.filter((s) => s.claims.length === 0);
        if (unsupported.length > 0) {
          fixes.push(
            `${unsupported.length} depth-4+ stocks need evidence: ` +
              unsupported.map((s) => `$${s.ticker}`).join(", ")
          );
        }

        await logPipelineRun({
          stage: "editor",
          status: "completed",
          decision: fixes.length === 0 ? "Nothing to fix" : fixes.join("; "),
        });

        return NextResponse.json({
          ok: true,
          message: fixes.length === 0 ? "Nothing to fix" : fixes.join(". "),
          fixes,
        });
      }

      // ── Orchestrator ────────────────────────────────────────────────
      case "orchestrator": {
        const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
        const orchRes = await fetch(`${baseUrl}/api/orchestrate`, { method: "POST" });
        const orchResult = await orchRes.json();
        return NextResponse.json({ ok: orchRes.ok, message: "Orchestration tick triggered", ...orchResult });
      }

      default:
        return NextResponse.json(
          { error: `Unknown agent: ${agent}. Valid: ingest, research, analysis, price, scoring, cleanup, watchdog, ops, auditor, editor, orchestrator` },
          { status: 400 }
        );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Agent trigger failed" }, { status: 500 });
  }
}
