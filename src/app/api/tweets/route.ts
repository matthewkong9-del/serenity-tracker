import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const tweets = await prisma.tweet.findMany({
    orderBy: { timestamp: "desc" },
    select: {
      id: true,
      content: true,
      timestamp: true,
      claimCount: true,
      processedAt: true,
    },
  });
  return NextResponse.json(tweets);
}
