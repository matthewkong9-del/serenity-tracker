import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/stocks/[ticker]/dedup-claims
 * Find potentially duplicate claims using word overlap similarity.
 * Returns groups of similar claims. User can merge or dismiss.
 */
export async function POST(_req: NextRequest, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();

  const stock = await prisma.stock.findUnique({
    where: { ticker },
    include: {
      claims: {
        select: { id: true, text: true, status: true, source: true },
      },
    },
  });

  if (!stock || stock.claims.length < 2) {
    return NextResponse.json({ groups: [] });
  }

  // Simple Jaccard similarity on word sets
  const tokenize = (text: string): string[] =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);

  const jaccard = (a: string[], b: string[]): number => {
    const aSet = new Set(a);
    let intersection = 0;
    for (let k = 0; k < b.length; k++) {
      if (aSet.has(b[k])) intersection++;
    }
    const union = a.length + b.length - intersection;
    return union === 0 ? 0 : intersection / union;
  };

  const groups: { claimIds: number[]; texts: string[]; similarity: number }[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < stock.claims.length; i++) {
    if (seen.has(stock.claims[i].id)) continue;

    const aWords = tokenize(stock.claims[i].text);
    const group = [stock.claims[i]];
    seen.add(stock.claims[i].id);

    for (let j = i + 1; j < stock.claims.length; j++) {
      if (seen.has(stock.claims[j].id)) continue;

      const bWords = tokenize(stock.claims[j].text);
      const similarity = jaccard(aWords, bWords);

      if (similarity > 0.5) {
        group.push(stock.claims[j]);
        seen.add(stock.claims[j].id);
      }
    }

    if (group.length > 1) {
      const avgSim =
        group.slice(1).reduce((sum, c) => {
          const bw = tokenize(c.text);
          return sum + jaccard(aWords, bw);
        }, 0) /
        (group.length - 1);

      groups.push({
        claimIds: group.map((c) => c.id),
        texts: group.map((c) => c.text),
        similarity: Math.round(avgSim * 100),
      });
    }
  }

  return NextResponse.json({ groups });
}

/** DELETE /api/stocks/[ticker]/dedup-claims — merge a group (keep first, delete rest) */
export async function DELETE(req: NextRequest, { params }: { params: { ticker: string } }) {
  const { keepId, deleteIds } = await req.json();
  if (!keepId || !deleteIds || !Array.isArray(deleteIds)) {
    return NextResponse.json({ error: "keepId and deleteIds required" }, { status: 400 });
  }

  await prisma.claim.deleteMany({
    where: { id: { in: deleteIds } },
  });

  return NextResponse.json({ merged: deleteIds.length, kept: keepId });
}
