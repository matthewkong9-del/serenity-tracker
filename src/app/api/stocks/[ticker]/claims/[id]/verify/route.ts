import { prisma } from "@/lib/db";
import { verifyClaim } from "@/lib/verify";
import { runExtractions } from "@/lib/relationships";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string; id: string } }
) {
  const ticker = params.ticker.toUpperCase();
  const claimId = parseInt(params.id);

  const exaKey = process.env.EXA_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  if (!exaKey) {
    return NextResponse.json(
      { error: "EXA_API_KEY not configured. Get a free key at https://dashboard.exa.ai" },
      { status: 500 }
    );
  }
  if (!deepseekKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not configured" }, { status: 500 });
  }

  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { stock: true },
  });

  if (!claim || claim.stock.ticker.toUpperCase() !== ticker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const verdict = await verifyClaim(claim.text, ticker, exaKey, deepseekKey);

    // Build evidence block
    const evidenceParts: string[] = [];
    evidenceParts.push(
      `[AI Verification — ${verdict.verdict.toUpperCase()} · ${verdict.confidence} confidence]`
    );
    evidenceParts.push(verdict.summary);
    if (verdict.sources.length > 0) {
      evidenceParts.push(
        "\nSources:\n" +
          verdict.sources.map((s) => `- ${s.title}: ${s.url}\n  "${s.snippet}"`).join("\n")
      );
    }

    const updatedClaim = await prisma.claim.update({
      where: { id: claimId },
      data: {
        status: verdict.verdict === "unresolved" ? claim.status : verdict.verdict,
        evidence: evidenceParts.join("\n\n"),
      },
    });

    // Re-extract relationships with new verification context
    runExtractions(ticker, deepseekKey);

    // Smart auto-summary: if >30% of claims are now resolved, invalidate summary
    const totalClaims = await prisma.claim.count({
      where: { stockId: claim.stockId },
    });
    const resolvedCount = await prisma.claim.count({
      where: {
        stockId: claim.stockId,
        status: { in: ["supported", "refuted", "disputed"] },
      },
    });
    if (totalClaims > 0 && resolvedCount / totalClaims > 0.3) {
      await prisma.stock.update({
        where: { ticker },
        data: { lastSummaryAt: null },
      });
    }

    return NextResponse.json({ claim: updatedClaim, verdict });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
