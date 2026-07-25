import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/triage
 * Returns all unverified claims grouped by stock, with file counts.
 * Sorted by: stocks with 0 docs first, then by most unverified claims.
 */
export async function GET() {
  // All unverified claims with stock + tweet
  const claims = await prisma.claim.findMany({
    where: { status: "unverified" },
    include: {
      stock: { select: { ticker: true, name: true } },
      tweet: { select: { content: true, timestamp: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // File counts per stock (only for stocks that have unverified claims)
  const tickers = Array.from(new Set(claims.map((c) => c.stock.ticker)));
  const fileCounts = await prisma.file.groupBy({
    by: ["stockId"],
    _count: { id: true },
  });

  // Build a stockId -> fileCount map
  const stocksWithFiles = await prisma.stock.findMany({
    where: { ticker: { in: tickers } },
    select: { id: true, ticker: true },
  });
  const tickerToStockId = Object.fromEntries(
    stocksWithFiles.map((s) => [s.ticker, s.id])
  );
  const stockIdToFileCount: Record<number, number> = {};
  for (const fc of fileCounts) {
    stockIdToFileCount[fc.stockId] = fc._count.id;
  }

  // Group claims by stock ticker
  const stockMap: Record<
    string,
    {
      ticker: string;
      name: string | null;
      fileCount: number;
      claims: typeof claims;
    }
  > = {};

  for (const claim of claims) {
    const ticker = claim.stock.ticker;
    if (!stockMap[ticker]) {
      const stockId = tickerToStockId[ticker];
      stockMap[ticker] = {
        ticker,
        name: claim.stock.name,
        fileCount: stockId ? stockIdToFileCount[stockId] || 0 : 0,
        claims: [],
      };
    }
    stockMap[ticker].claims.push(claim);
  }

  // Sort: 0 docs first, then by unverified count desc
  const stocks = Object.values(stockMap).sort((a, b) => {
    if (a.fileCount === 0 && b.fileCount > 0) return -1;
    if (b.fileCount === 0 && a.fileCount > 0) return 1;
    return b.claims.length - a.claims.length;
  });

  const totalUnverified = claims.length;
  const totalStocks = stocks.length;
  const stocksWithDocs = stocks.filter((s) => s.fileCount > 0).length;
  const stocksWithoutDocs = stocks.filter((s) => s.fileCount === 0).length;

  return NextResponse.json({
    stocks,
    summary: {
      totalUnverified,
      totalStocks,
      stocksWithDocs,
      stocksWithoutDocs,
    },
  });
}
