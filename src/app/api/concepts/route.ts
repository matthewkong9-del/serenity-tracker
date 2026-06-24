import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  const where: Record<string, any> = {};
  if (category && category !== "all") {
    where.category = category;
  }
  if (search) {
    where.name = { contains: search };
  }

  const concepts = await prisma.concept.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { tweets: true } },
      tweets: {
        include: {
          tweet: {
            select: {
              id: true,
              content: true,
              timestamp: true,
            },
          },
        },
        orderBy: { tweet: { timestamp: "desc" } },
        take: 50,
      },
    },
  });

  // Collect categories
  const categories = await prisma.concept.groupBy({
    by: ["category"],
    _count: { category: true },
  });

  return NextResponse.json({
    concepts,
    categories: categories
      .filter((c) => c.category)
      .map((c) => ({ name: c.category, count: c._count.category })),
  });
}
