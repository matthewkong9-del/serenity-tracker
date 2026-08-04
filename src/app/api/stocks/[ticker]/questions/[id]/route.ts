/**
 * PUT/DELETE /api/stocks/[ticker]/questions/[id]
 *
 * PUT    — update answer, status, priority, category
 * DELETE — remove question
 */

import { prisma } from "@/lib/db";
import { enqueueTask } from "@/lib/pending-tasks";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { ticker: string; id: string } }
) {
  const ticker = params.ticker.toUpperCase();
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { answer, status, priority, priorityLock, category } = body as {
    answer?: string | null;
    status?: string;
    priority?: number;
    priorityLock?: boolean;
    category?: string | null;
  };

  // Build update data
  const data: Record<string, unknown> = {};

  if (answer !== undefined) {
    data.answer = answer || null;
    if (answer) {
      data.answeredAt = new Date();
      data.staleReason = null;
      data.staleAt = null;
    }
  }

  if (status !== undefined) {
    if (!["open", "answered", "skipped"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: open, answered, skipped" },
        { status: 400 }
      );
    }
    data.status = status;
    if (status === "answered" && answer === undefined) {
      // Status set to answered without answer — keep existing answer
    }
  }

  if (priority !== undefined) {
    if (typeof priority !== "number" || priority < 0) {
      return NextResponse.json(
        { error: "Priority must be a non-negative number" },
        { status: 400 }
      );
    }
    data.priority = priority;
    data.priorityLock = true; // manual priority adjustment locks the formula
  }

  if (priorityLock !== undefined) {
    data.priorityLock = priorityLock;
  }

  if (category !== undefined) {
    data.category = category || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.researchQuestion.updateMany({
      where: { id, stock: { ticker } },
      data,
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    // If answer was set, trigger a re-summarization so the executive brief
    // picks up the new research findings.
    if (data.answer) {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (apiKey) {
        await enqueueTask({ kind: "summarize", ticker });
      }
    }

    const question = await prisma.researchQuestion.findUnique({
      where: { id },
      select: {
        id: true,
        question: true,
        answer: true,
        source: true,
        category: true,
        status: true,
        priority: true,
        priorityLock: true,
        staleReason: true,
        staleAt: true,
        answeredAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(question);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { ticker: string; id: string } }
) {
  const ticker = params.ticker.toUpperCase();
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await prisma.researchQuestion.deleteMany({
    where: { id, stock: { ticker } },
  });

  return NextResponse.json({ ok: true });
}
