import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { researchClaim } from "@/lib/research";

export const dynamic = "force-dynamic";

/** POST /api/research-all?limit=20
 *  Researches all unverified claims via Brave Search → DeepSeek pipeline.
 *  Processes claims in small batches with concurrency=2.
 *  Safe to call repeatedly — skips claims already in progress. */
export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured" },
      { status: 500 }
    );
  }

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") || "50"),
    200
  );

  // Find unverified claims that haven't been researched yet
  const claims = await prisma.claim.findMany({
    where: {
      status: "unverified",
      researchStatus: { in: ["pending", "failed"] }, // retry failed ones too
    },
    include: { stock: { select: { ticker: true } } },
    orderBy: { createdAt: "asc" }, // oldest first
    take: limit,
  });

  if (claims.length === 0) {
    return NextResponse.json({
      message: "No unverified claims to research.",
      researched: 0,
      failed: 0,
      total: 0,
    });
  }

  console.log(`[research-all] researching ${claims.length} claims`);

  let researched = 0;
  let failed = 0;
  let skipped = 0;

  const CONCURRENCY = 2;
  const queue = [...claims];

  async function worker() {
    while (queue.length > 0) {
      const claim = queue.shift();
      if (!claim) break;
      try {
        await researchClaim(claim.id, claim.stock.ticker, apiKey!);
        researched++;
      } catch (e: any) {
        console.error(
          `[research-all] failed claim #${claim.id}: ${e.message}`
        );
        failed++;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, claims.length) },
    () => worker()
  );
  await Promise.all(workers);

  // Count remaining
  const remaining = await prisma.claim.count({
    where: {
      status: "unverified",
      researchStatus: { in: ["pending", "failed"] },
    },
  });

  console.log(
    `[research-all] done: ${researched} researched, ${failed} failed, ${remaining} remaining`
  );

  return NextResponse.json({
    researched,
    failed,
    skipped,
    remaining,
    total: claims.length,
  });
}

/** GET /api/research-all — check how many unverified claims are waiting. */
export async function GET() {
  const [unverified, researching, done, failed] = await Promise.all([
    prisma.claim.count({ where: { status: "unverified", researchStatus: "pending" } }),
    prisma.claim.count({ where: { researchStatus: "researching" } }),
    prisma.claim.count({ where: { researchStatus: "done" } }),
    prisma.claim.count({ where: { researchStatus: "failed" } }),
  ]);

  const estimatedCost = (unverified * 0.007).toFixed(2);

  return NextResponse.json({
    pending: unverified,
    researching,
    done,
    failed,
    estimatedCost,
  });
}
