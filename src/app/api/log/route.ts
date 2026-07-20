import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") || "7");
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [apiCalls, cleanupTasks] = await Promise.all([
    prisma.apiCallLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cleanupTask.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const entries = [
    ...apiCalls.map((c) => ({
      id: c.id,
      type: "api_call" as const,
      timestamp: c.createdAt.toISOString(),
      source: c.source,
      purpose: c.purpose,
      model: c.model,
      cost: c.estimatedCost,
      inputChars: c.inputChars,
      outputChars: c.outputChars,
    })),
    ...cleanupTasks.map((t) => ({
      id: t.id,
      type: "cleanup_task" as const,
      timestamp: t.createdAt.toISOString(),
      taskType: t.type,
      taskStatus: t.status,
      summary: t.summary,
      detail: t.detail,
    })),
  ].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return NextResponse.json({ entries });
}
