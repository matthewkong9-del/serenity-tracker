import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const stocks = await prisma.stock.findMany({
    select: {
      ticker: true,
      name: true,
      sector: true,
      summary: true,
      lastSummaryAt: true,
      extractionError: true,
      updatedAt: true,
      claims: {
        select: { status: true },
      },
      _count: {
        select: { files: true, entries: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  let totalClaims = 0;
  let totalResolved = 0;

  const stockList = stocks.map((s) => {
    const counts = { unverified: 0, supported: 0, refuted: 0, disputed: 0 };
    for (const c of s.claims) {
      counts[c.status as keyof typeof counts]++;
    }
    const claimTotal = s.claims.length;
    totalClaims += claimTotal;
    totalResolved += counts.supported + counts.refuted;

    return {
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      summary: s.summary,
      lastSummaryAt: s.lastSummaryAt,
      stance: parseStanceFromSummary(s.summary),
      extractionError: s.extractionError,
      updatedAt: s.updatedAt,
      claimCounts: counts,
      fileCount: s._count.files,
      entryCount: s._count.entries,
    };
  });

  const verifiedRate = totalClaims > 0 ? Math.round((totalResolved / totalClaims) * 100) : 0;

  return NextResponse.json({
    stocks: stockList,
    totals: {
      stocks: stocks.length,
      claims: totalClaims,
      verifiedRate: `${verifiedRate}%`,
      stocksWithErrors: stocks.filter((s) => s.extractionError).length,
    },
  });
}

function parseStanceFromSummary(summary: string | null): string | null {
  if (!summary) return null;
  const match = summary.match(/\*\*Stance\*\*[:\s]*.*?(Bullish|Bearish|Neutral)/i);
  return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : null;
}
