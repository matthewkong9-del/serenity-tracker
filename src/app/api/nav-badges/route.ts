import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Force dynamic rendering so badge counts reflect DB changes after a deploy
// instead of a build-time snapshot. (Browser may still cache briefly via headers.)
export const dynamic = "force-dynamic";

/** Lightweight endpoint for nav notification badges. Cached for 30s in the browser. */
export async function GET() {
  const [unresearchedClaims, stocks, decisions] = await Promise.all([
    // Only count claims that haven't been researched yet — not ones already
    // researched but left "unverified" (verdict was unclear).
    prisma.claim.count({
      where: {
        status: "unverified",
        researchStatus: { in: ["pending", "failed"] },
      },
    }),
    prisma.stock.count({
      where: { extractionError: { not: null } },
    }),
    prisma.decision.count({
      where: { maturity: "actionable" },
    }),
  ]);

  const totalClaims = await prisma.claim.count();

  return NextResponse.json(
    {
      unverifiedClaims: unresearchedClaims,
      stocksWithErrors: stocks,
      actionableDecisions: decisions,
      totalClaims,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
