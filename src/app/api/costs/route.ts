import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [todayLogs, monthLogs, allTime] = await Promise.all([
    prisma.apiCallLog.findMany({
      where: { createdAt: { gte: todayStart } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.apiCallLog.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { source: true, estimatedCost: true },
    }),
    prisma.apiCallLog.aggregate({
      _sum: { estimatedCost: true },
      _count: true,
    }),
  ]);

  // Brave: count only today (free up to 2,000/mo)
  const braveToday = todayLogs.filter((l) => l.source === "Brave").length;

  // By purpose today
  const byPurpose: Record<string, { count: number; cost: number }> = {};
  for (const l of todayLogs) {
    const p = l.purpose || "unknown";
    if (!byPurpose[p]) byPurpose[p] = { count: 0, cost: 0 };
    byPurpose[p].count++;
    byPurpose[p].cost += l.estimatedCost || 0;
  }

  // Monthly totals
  let monthCost = 0;
  let monthCalls = 0;
  const bySource: Record<string, number> = {};
  for (const l of monthLogs) {
    monthCost += l.estimatedCost || 0;
    monthCalls++;
    bySource[l.source] = (bySource[l.source] || 0) + (l.estimatedCost || 0);
  }

  // Pending: count claims that still need research (unverified + not yet researched)
  const unverifiedCount = await prisma.claim.count({
    where: {
      status: "unverified",
      researchStatus: { in: ["pending", "failed"] },
    },
  });
  const estimatedResearchCost = (unverifiedCount * 0.007).toFixed(2); // ~$0.007/claim

  return NextResponse.json({
    today: {
      calls: todayLogs.length,
      cost: todayLogs.reduce((s, l) => s + (l.estimatedCost || 0), 0),
    },
    month: {
      calls: monthCalls,
      cost: monthCost,
    },
    allTime: {
      calls: allTime._count,
      cost: allTime._sum?.estimatedCost || 0,
    },
    byPurpose,
    bySource,
    braveToday,
    pending: {
      unverifiedClaims: unverifiedCount,
      estimatedCost: estimatedResearchCost,
    },
  });
}
