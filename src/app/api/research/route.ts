import { prisma } from "@/lib/db";
import { researchClaim } from "@/lib/research";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── GET /api/research?filter=pending|done|failed|all&stock=SNDK&limit=50 ──

export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get("filter") || "all";
  const stock = req.nextUrl.searchParams.get("stock") || undefined;
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") || "50"),
    200
  );

  // Build where clause
  const where: any = {};
  if (filter === "pending") {
    // Only claims that still need research: unverified AND pending/failed.
    // Claims the user already verified (supported/refuted) don't need research.
    where.status = "unverified";
    where.researchStatus = { in: ["pending", "failed"] };
  } else if (filter === "done") {
    where.researchStatus = "done";
  } else if (filter === "researching") {
    where.researchStatus = "researching";
  }
  if (stock) where.stock = { ticker: stock.toUpperCase() };

  const [claims, counts] = await Promise.all([
    prisma.claim.findMany({
      where,
      include: {
        stock: { select: { ticker: true, name: true } },
        tweet: { select: { content: true, timestamp: true } },
      },
      orderBy: [
        { researchStatus: "asc" }, // pending first
        { createdAt: "desc" },
      ],
      take: limit,
    }),
    // Counts for filter pills — consistent with nav badge
    Promise.all([
      prisma.claim.count({
        where: {
          status: "unverified",
          researchStatus: { in: ["pending", "failed"] },
        },
      }),
      prisma.claim.count({ where: { researchStatus: "done" } }),
      prisma.claim.count({ where: { researchStatus: "researching" } }),
      prisma.claim.count({ where: { researchStatus: "failed" } }),
    ]),
  ]);

  const [pending, done, researching, failed] = counts;
  const estimatedCost = (pending * 0.007).toFixed(2);

  return NextResponse.json({
    claims,
    counts: { pending, done, researching, failed, total: claims.length },
    estimatedCost,
  });
}

// ── POST /api/research ──
// Body: { claimIds?: number[], limit?: number }
// If claimIds given, research those. Otherwise research oldest N pending claims.

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { claimIds, limit = 10 } = body;

  let claims: { id: number; stock: { ticker: string } }[];

  if (claimIds && claimIds.length > 0) {
    claims = await prisma.claim.findMany({
      where: {
        id: { in: claimIds },
        researchStatus: { in: ["pending", "failed"] },
      },
      include: { stock: { select: { ticker: true } } },
      take: Math.min(limit, 200),
    });
  } else {
    claims = await prisma.claim.findMany({
      where: {
        status: "unverified",
        researchStatus: { in: ["pending", "failed"] },
      },
      include: { stock: { select: { ticker: true } } },
      orderBy: { createdAt: "asc" },
      take: Math.min(limit, 200),
    });
  }

  if (claims.length === 0) {
    return NextResponse.json({ researched: 0, failed: 0, message: "Nothing to research" });
  }

  let researched = 0;
  let failed = 0;
  const CONCURRENCY = 2;
  const queue = [...claims];

  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) break;
      try {
        await researchClaim(c.id, c.stock.ticker, apiKey!);
        researched++;
      } catch (e: any) {
        console.error(`[research] claim #${c.id} failed: ${e.message}`);
        failed++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, claims.length) }, () => worker())
  );

  const remaining = await prisma.claim.count({
    where: {
      status: "unverified",
      researchStatus: { in: ["pending", "failed"] },
    },
  });

  return NextResponse.json({ researched, failed, remaining });
}
