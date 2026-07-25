import { prisma, parseStance } from "@/lib/db";
import { assignBucket, type OpportunityBucket } from "@/lib/scoring";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const stocks = await prisma.stock.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      ticker: true,
      name: true,
      sector: true,
      summary: true,
      currentPrice: true,
      pbRatio: true,
      marketCap: true,
      chokepointDepth: true,
      narrative: true,
      lastPriceUpdated: true,
      updatedAt: true,
      _count: { select: { files: true, notes: true, claims: true } },
      claims: {
        select: { status: true },
      },
    },
  });

  // Compute stance, claim stats, and opportunity bucket server-side
  const enriched = stocks.map((s) => {
    const counts = { supported: 0, refuted: 0, disputed: 0, unverified: 0 };
    for (const c of s.claims) {
      if (c.status in counts) {
        (counts as any)[c.status]++;
      } else {
        counts.unverified++;
      }
    }

    const bucket: OpportunityBucket = assignBucket({
      chokepointDepth: s.chokepointDepth,
      pbRatio: s.pbRatio,
      marketCap: s.marketCap,
      currentPrice: s.currentPrice,
      summary: s.summary,
      totalClaims: s._count.claims,
      supportedClaims: counts.supported,
      refutedClaims: counts.refuted,
    });

    const { claims: _, ...rest } = s;
    return {
      ...rest,
      stance: parseStance(s.summary),
      bucket,
      claimCounts: counts,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ticker, name, sector, notes } = body;

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  try {
    const stock = await prisma.stock.create({
      data: {
        ticker: ticker.toUpperCase().trim(),
        name: name?.trim() || null,
        sector: sector?.trim() || null,
        generalNotes: notes?.trim() || null,
      },
    });
    return NextResponse.json(stock, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Stock already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create stock" }, { status: 500 });
  }
}
