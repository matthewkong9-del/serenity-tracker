import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Force dynamic rendering: without this, Next.js prerenders the route at build
// time and serves a frozen tweet list — new tweets added by /api/sync after a
// deploy never appear until the next rebuild.
export const dynamic = "force-dynamic";

export async function GET() {
  const tweets = await prisma.tweet.findMany({
    orderBy: { timestamp: "desc" },
    select: {
      id: true,
      content: true,
      timestamp: true,
      claimCount: true,
      isInvesting: true,
      processedAt: true,
    },
  });
  return NextResponse.json(tweets);
}
