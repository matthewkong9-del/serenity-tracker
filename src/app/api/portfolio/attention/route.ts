import { prisma } from "@/lib/db";
import { rankPortfolioAttention } from "@/lib/summarize";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const sectorFilter = body.sector || null;

  const stocks = await prisma.stock.findMany({
    where: sectorFilter ? { sector: sectorFilter } : {},
    select: {
      ticker: true,
      name: true,
      sector: true,
      summary: true,
      lastSummaryAt: true,
      extractionError: true,
      claims: {
        select: { status: true },
      },
      _count: {
        select: { files: true },
      },
    },
  });

  const summaries = stocks.map((s) => {
    const counts = { unverified: 0, supported: 0, refuted: 0, disputed: 0 };
    for (const c of s.claims) counts[c.status as keyof typeof counts]++;

    const daysSince = s.lastSummaryAt
      ? Math.floor(
          (Date.now() - new Date(s.lastSummaryAt).getTime()) / (1000 * 60 * 60 * 24)
        )
      : null;

    return {
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      stance: parseStance(s.summary),
      claimCounts: counts,
      fileCount: s._count.files,
      hasSummary: !!s.summary,
      hasExtractionError: !!s.extractionError,
      daysSinceLastSummary: daysSince,
    };
  });

  try {
    const ranked = await rankPortfolioAttention(summaries, apiKey);
    return NextResponse.json({ ranked });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function parseStance(summary: string | null): string | null {
  if (!summary) return null;
  const match = summary.match(
    /\*\*Stance\*\*[:\s]*.*?(Bullish|Bearish|Neutral)/i
  );
  return match
    ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
    : null;
}
