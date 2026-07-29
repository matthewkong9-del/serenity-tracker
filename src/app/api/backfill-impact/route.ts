/**
 * POST /api/backfill-impact — scores all claims with null impactScore.
 *
 * Uses the same defaultImpactScore() heuristic as the sync route,
 * so no LLM cost. One-time administrative endpoint.
 */

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function defaultImpactScore(text: string, insightType?: string | null): number {
  if (insightType === "chokepoint") return 5;
  if (
    insightType === "dependency" ||
    insightType === "pricing_power" ||
    insightType === "moat_signal"
  )
    return 4;
  if (insightType === "risk_factor") return 2;
  const t = text.toLowerCase();
  if (
    t.match(
      /\b(sole|only supplier|monopoly|bottleneck|cannot replace|critical|exclusive|must have|irreplaceable|single source)\b/
    )
  )
    return 4;
  if (t.match(/\b(vague|rumor|might|maybe|possibly|unclear|speculation)\b/))
    return 2;
  return 3;
}

export async function POST() {
  const claims = await prisma.claim.findMany({
    where: { impactScore: null },
    select: { id: true, text: true, insightType: true },
  });

  let updated = 0;
  for (const c of claims) {
    const score = defaultImpactScore(c.text, c.insightType);
    await prisma.claim.update({
      where: { id: c.id },
      data: { impactScore: score },
    });
    updated++;
  }

  return NextResponse.json({
    ok: true,
    updated,
    message: `Scored ${updated} claims with default impact scores.`,
  });
}
