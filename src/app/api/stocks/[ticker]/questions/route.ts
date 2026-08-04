/**
 * GET/POST /api/stocks/[ticker]/questions
 *
 * GET  — list questions + coverage (lazy-seeds templates)
 * POST — create a user-written question
 */

import { prisma } from "@/lib/db";
import { effectivePriority } from "@/lib/question-priority";
import { ensureTemplateQuestions } from "@/lib/questions";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const stock = await prisma.stock.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
    select: { id: true },
  });
  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  // Lazy-seed template questions on first access
  await ensureTemplateQuestions(stock.id);

  const questions = await prisma.researchQuestion.findMany({
    where: { stockId: stock.id },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
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

  // Compute effective priority for each question
  const withPriority = questions.map((q) => ({
    ...q,
    effectivePriority: effectivePriority({
      priority: q.priority,
      priorityLock: q.priorityLock,
      staleReason: q.staleReason,
      status: q.status,
      answer: q.answer,
      answeredAt: q.answeredAt,
      updatedAt: q.updatedAt,
    }),
  }));

  // Compute coverage by category
  const coverageMap = new Map<
    string,
    { total: number; answered: number; open: number }
  >();
  for (const q of questions) {
    const cat = q.category || "general";
    const entry = coverageMap.get(cat) || { total: 0, answered: 0, open: 0 };
    entry.total++;
    if (q.status === "answered") entry.answered++;
    if (q.status === "open") entry.open++;
    coverageMap.set(cat, entry);
  }
  const coverage = Array.from(coverageMap.entries()).map(
    ([category, counts]) => ({ category, ...counts })
  );

  return NextResponse.json({ questions: withPriority, coverage });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const stock = await prisma.stock.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
    select: { id: true },
  });
  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { question, category } = body as {
    question?: string;
    category?: string;
  };

  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json(
      { error: "Question text is required" },
      { status: 400 }
    );
  }

  const created = await prisma.researchQuestion.create({
    data: {
      stockId: stock.id,
      question: question.trim(),
      category: category || null,
      source: "user",
      priority: 5, // user questions start high
      priorityLock: false,
      status: "open",
    },
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
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
