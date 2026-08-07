import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const statuses = searchParams.get("statuses"); // comma-separated, e.g. "disputed,refuted,unverified"
  const search = searchParams.get("search");
  const tweetId = searchParams.get("tweetId");
  const sort = searchParams.get("sort") || "newest"; // "newest" | "oldest" | "impact"
  const limit = parseInt(searchParams.get("limit") || "0") || 0;

  const researchStatus = searchParams.get("researchStatus");

  const where: Record<string, any> = {};

  if (status && status !== "all") {
    where.status = status;
  }
  if (statuses) {
    where.status = { in: statuses.split(",").map((s) => s.trim()) };
  }

  // "pending" = claims waiting for research (pending or previously failed)
  if (researchStatus === "pending") {
    where.researchStatus = { in: ["pending", "failed"] };
  }

  if (tweetId) {
    where.tweetId = parseInt(tweetId);
  }

  if (search) {
    where.OR = [
      { text: { contains: search } },
      { evidence: { contains: search } },
      { source: { contains: search } },
      { stock: { ticker: { contains: search.toUpperCase() } } },
      { stock: { name: { contains: search } } },
    ];
  }

  const claims = await prisma.claim.findMany({
    where,
    orderBy:
      sort === "impact"
        ? [{ impactScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
        : { createdAt: sort === "oldest" ? "asc" : "desc" },
    ...(limit > 0 ? { take: limit } : {}),
    include: {
      stock: { select: { ticker: true, name: true } },
      tweet: { select: { id: true, content: true, timestamp: true } },
    },
  });

  // Count by status for the filter tabs
  const counts = await prisma.claim.groupBy({
    by: ["status"],
    _count: { status: true },
    where: tweetId
      ? { tweetId: parseInt(tweetId) }
      : search
        ? {
            OR: [
              { text: { contains: search } },
              { evidence: { contains: search } },
              { source: { contains: search } },
              { stock: { ticker: { contains: search.toUpperCase() } } },
              { stock: { name: { contains: search } } },
            ],
          }
        : {},
  });

  const statusCounts: Record<string, number> = {
    unverified: 0,
    supported: 0,
    refuted: 0,
    disputed: 0,
  };
  for (const c of counts) {
    statusCounts[c.status] = c._count.status;
  }

  return NextResponse.json({ claims, counts: statusCounts });
}
