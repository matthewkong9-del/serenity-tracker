import { prisma } from "@/lib/db";
import { verifyClaims } from "@/lib/verify";
import { runExtractions } from "@/lib/relationships";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();

  const exaKey = process.env.EXA_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  if (!exaKey) {
    return NextResponse.json(
      { error: "EXA_API_KEY not configured. Get a free key at https://dashboard.exa.ai" },
      { status: 500 }
    );
  }
  if (!deepseekKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured" },
      { status: 500 }
    );
  }

  const stock = await prisma.stock.findUnique({
    where: { ticker },
    include: {
      claims: {
        where: { status: "unverified" },
        select: { id: true, text: true },
      },
    },
  });

  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  if (stock.claims.length === 0) {
    return NextResponse.json({ verified: 0, results: [] });
  }

  // Run all unverified claims through the verification pipeline
  const results = await verifyClaims(
    stock.claims.map((c) => ({ id: c.id, text: c.text })),
    ticker,
    exaKey,
    deepseekKey,
    2
  );

  // Persist results
  const updates: { claimId: number; verdict: string; status: string }[] = [];
  const entries = Array.from(results.entries());
  for (let i = 0; i < entries.length; i++) {
    const [claimId, verdict] = entries[i];
    const evidenceParts: string[] = [];
    evidenceParts.push(
      `[AI Verification — ${verdict.verdict.toUpperCase()} · ${verdict.confidence} confidence]`
    );
    evidenceParts.push(verdict.summary);
    if (verdict.sources.length > 0) {
      evidenceParts.push(
        "\nSources:\n" +
          verdict.sources
            .map((s: { url: string; title: string; snippet: string }) =>
              `- ${s.title}: ${s.url}\n  "${s.snippet}"`)
            .join("\n")
      );
    }

    const newStatus =
      verdict.verdict === "unresolved"
        ? "unverified"
        : verdict.verdict;

    await prisma.claim.update({
      where: { id: claimId },
      data: {
        status: newStatus,
        evidence: evidenceParts.join("\n\n"),
      },
    });

    updates.push({ claimId, verdict: verdict.verdict, status: newStatus });
  }

  // Re-extract relationships with new verification context
  runExtractions(ticker, deepseekKey);

  // Smart auto-summary: if >30% of claims changed from unverified, invalidate the summary
  // so the UI shows "Run Summary" as needed — the thesis may have shifted.
  const totalClaims = await prisma.claim.count({ where: { stockId: stock.id } });
  const resolvedNow = updates.filter((u) => u.verdict !== "unresolved").length;
  if (totalClaims > 0 && resolvedNow / stock.claims.length > 0.3) {
    await prisma.stock.update({
      where: { ticker },
      data: { lastSummaryAt: null },
    });
  }

  return NextResponse.json({
    verified: updates.length,
    results: updates,
    summaryStale: resolvedNow / stock.claims.length > 0.3,
  });
}
