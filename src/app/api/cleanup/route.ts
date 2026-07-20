import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/deepseek";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Agent 1 — Monthly Cleanup
//
// GET  /api/cleanup           — list all CleanupTasks
// POST /api/cleanup           — run the scanner (body: { action: "scan" })
// PUT  /api/cleanup           — execute approved tasks (body: { action: "execute" })
// PUT  /api/cleanup?id=X      — update a single task's status (body: { status })
// ---------------------------------------------------------------------------

interface DuplicateGroup {
  keptClaimId: number;
  duplicateIds: number[];
  mergedText: string;
  reason: string;
}

const SCAN_PROMPT = `You are a data quality auditor. Analyze the following claims for ${"${ticker}"} and identify near-duplicates.

Two claims are duplicates if they assert the SAME underlying fact, even if worded differently. Examples:
- "LPKF has 80% market share in LDS" and "80% of major players selected LPKF equipment" → likely the same fact
- "Revenue grew 20% in Q3" and "Q3 earnings were strong, 20% revenue growth" → same fact
- "NVIDIA supply chain is constrained" and "NVDA cant get enough chips" → same fact
- "Management is confident about Q4" and "Revenue grew 20% in Q3" → different facts

For each duplicate group, decide which claim to KEEP (the clearest, most specific one) and provide a merged text that captures the most precise version of the claim.

Return ONLY valid JSON:
{
  "duplicateGroups": [
    {
      "keptClaimId": 42,
      "duplicateIds": [87, 103],
      "mergedText": "LPKF has ~80% market share in LDS equipment among major global players",
      "reason": "Claims 42 and 87 assert the same ~80% market share fact with different wording. Claim 103 references the same metric indirectly. Kept claim 42 as it's the most specific."
    }
  ]
}

If there are NO duplicates, return { "duplicateGroups": [] }.

CLAIMS FOR ${"${ticker}"}:
{claims}`;

async function scanTicker(
  ticker: string,
  apiKey: string
): Promise<DuplicateGroup[]> {
  const claims = await prisma.claim.findMany({
    where: { stock: { ticker } },
    select: { id: true, text: true },
  });

  if (claims.length < 2) return []; // can't have duplicates with < 2 claims

  const claimsList = claims.map((c) => `[id: ${c.id}] ${c.text}`).join("\n");
  const prompt = SCAN_PROMPT.replace(/\$\{ticker\}/g, ticker).replace("{claims}", claimsList);

  const result = await chatJson<{ duplicateGroups: DuplicateGroup[] }>(
    [{ role: "user", content: prompt }],
    apiKey,
    { temperature: 0.1, purpose: "cleanup_scan" }
  );

  return result.duplicateGroups || [];
}

export async function GET() {
  const tasks = await prisma.cleanupTask.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const { action } = await req.json();
  if (action !== "scan") {
    return NextResponse.json({ error: "action must be 'scan'" }, { status: 400 });
  }

  // Clear previous pending/ignored tasks (re-scan replaces them)
  await prisma.cleanupTask.deleteMany({
    where: { status: { in: ["pending", "ignored"] } },
  });

  const stocks = await prisma.stock.findMany({
    where: { claims: { some: {} } },
    select: { ticker: true },
  });

  let totalGroups = 0;

  for (const stock of stocks) {
    try {
      const groups = await scanTicker(stock.ticker, apiKey);
      for (const g of groups) {
        await prisma.cleanupTask.create({
          data: {
            type: "duplicate_claim",
            status: "pending",
            summary: `${stock.ticker}: ${g.mergedText.slice(0, 200)}`,
            detail: JSON.stringify(g),
          },
        });
        totalGroups++;
      }
    } catch (e: any) {
      console.error(`[cleanup] scan failed for ${stock.ticker}: ${e.message}`);
    }
  }

  return NextResponse.json({
    scanned: stocks.length,
    duplicateGroups: totalGroups,
  });
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // Single-task status update
  if (id) {
    const { status } = await req.json();
    if (!["approved", "ignored"].includes(status)) {
      return NextResponse.json({ error: "status must be 'approved' or 'ignored'" }, { status: 400 });
    }
    await prisma.cleanupTask.update({
      where: { id: parseInt(id) },
      data: { status },
    });
    return NextResponse.json({ ok: true });
  }

  // Bulk execute all approved tasks
  const { action } = await req.json();
  if (action !== "execute") {
    return NextResponse.json({ error: "action must be 'execute'" }, { status: 400 });
  }

  const tasks = await prisma.cleanupTask.findMany({
    where: { status: "approved", type: "duplicate_claim" },
  });

  let merged = 0;
  for (const task of tasks) {
    try {
      const detail: DuplicateGroup = JSON.parse(task.detail);
      if (detail.duplicateIds.length > 0) {
        // Merge duplicate claims: update text on kept claim, delete the rest
        await prisma.claim.update({
          where: { id: detail.keptClaimId },
          data: { text: detail.mergedText },
        });
        await prisma.claim.deleteMany({
          where: { id: { in: detail.duplicateIds } },
        });
        merged += detail.duplicateIds.length;
      }
      await prisma.cleanupTask.update({
        where: { id: task.id },
        data: { status: "executed" },
      });
    } catch (e: any) {
      console.error(`[cleanup] execute failed for task ${task.id}: ${e.message}`);
    }
  }

  return NextResponse.json({ merged, tasks: tasks.length });
}
