import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/** Lightweight endpoint for nav notification badges. Cached for 30s in the browser. */
export async function GET() {
  const [claims, stocks, decisions] = await Promise.all([
    prisma.claim.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.stock.count({
      where: { extractionError: { not: null } },
    }),
    prisma.decision.count({
      where: { maturity: "actionable" },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const c of claims) {
    counts[c.status] = c._count;
  }

  return NextResponse.json(
    {
      unverifiedClaims: counts.unverified || 0,
      stocksWithErrors: stocks,
      actionableDecisions: decisions,
      totalClaims: Object.values(counts).reduce((a, b) => a + b, 0),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
