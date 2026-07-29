/**
 * GET /api/stocks/[ticker]/peers
 *
 * Returns peer companies (competitors, partners, etc.) for comparison.
 * Uses existing Relationship data + peer stock metrics.
 */

import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } }
) {
  const stock = await prisma.stock.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
    select: { id: true },
  });
  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const relationships = await prisma.relationship.findMany({
    where: { stockId: stock.id },
    select: { type: true, target: true, sourceConfidence: true, description: true },
    orderBy: { type: "asc" },
  });

  // Look up peer tickers for financial comparison
  const peerTickers = Array.from(
    new Set(
      relationships
        .filter((r) => r.type === "competitor" || r.type === "partner")
        .map((r) => r.target.toUpperCase())
        .filter((t) => t !== params.ticker.toUpperCase())
    )
  );

  const peerStocks =
    peerTickers.length > 0
      ? await prisma.stock.findMany({
          where: { ticker: { in: peerTickers } },
          select: {
            ticker: true,
            name: true,
            currentPrice: true,
            pbRatio: true,
            marketCap: true,
            chokepointDepth: true,
          },
        })
      : [];

  const peerMap = new Map(peerStocks.map((p) => [p.ticker, p]));

  const peers = relationships
    .filter((r) => r.type === "competitor" || r.type === "partner")
    .map((r) => {
      const peer = peerMap.get(r.target.toUpperCase());
      return {
        ticker: r.target,
        name: peer?.name || null,
        relationship: r.type,
        confidence: r.sourceConfidence,
        description: r.description,
        currentPrice: peer?.currentPrice || null,
        pbRatio: peer?.pbRatio || null,
        marketCap: peer?.marketCap || null,
        chokepointDepth: peer?.chokepointDepth || null,
      };
    });

  return NextResponse.json(peers);
}
