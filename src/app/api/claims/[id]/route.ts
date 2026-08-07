import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["unverified", "supported", "refuted", "disputed"];

/**
 * PUT /api/claims/[id]
 *
 * Human research workspace: the user completes research manually and enters
 * the verdict + evidence. This overrides the usual AI-owned status/evidence
 * convention (ADR: AI-owns-status) — deliberate, for the /review page where
 * the human is the researcher.
 *
 * Body: { status?, evidence? } — at least one required.
 * Saving marks the claim researchStatus="done" so it leaves the AI research
 * queue; it stays visible in the review workspace under its new status.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const { status, evidence } = body as { status?: string; evidence?: string };

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }
  if (status === undefined && evidence === undefined) {
    return NextResponse.json(
      { error: "Provide at least `status` or `evidence`" },
      { status: 400 }
    );
  }

  try {
    const claim = await prisma.claim.update({
      where: { id: parseInt(params.id) },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(evidence !== undefined ? { evidence: evidence.trim() || null } : {}),
        // Human completed the research — take it out of the AI research queue
        researchStatus: "done",
        researchedAt: new Date(),
      },
    });
    return NextResponse.json(claim);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
