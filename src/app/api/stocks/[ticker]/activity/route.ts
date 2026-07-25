import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/stocks/[ticker]/activity?limit=15
 *
 * Returns recent PipelineRun entries for a stock, ordered by most recent first.
 * Used by the knowledge base changelog to show what happened.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") || "15"),
    50
  );

  const entries = await prisma.pipelineRun.findMany({
    where: {
      stockTicker: ticker,
      status: { in: ["completed", "failed", "skipped"] },
    },
    select: {
      id: true,
      stage: true,
      status: true,
      decision: true,
      startedAt: true,
    },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ entries });
}
