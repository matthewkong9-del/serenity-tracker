import { prisma } from "@/lib/db";
import { enqueueTask } from "@/lib/pending-tasks";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: { ticker: string } }) {
  const stock = await prisma.stock.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
    include: { notes: { orderBy: { createdAt: "desc" } } },
  });
  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(stock.notes);
}

export async function POST(req: NextRequest, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();
  const stock = await prisma.stock.findUnique({ where: { ticker } });
  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { title, content, tag } = body;

  if (!content || !content.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const entry = await prisma.note.create({
    data: {
      stockId: stock.id,
      title: title?.trim() || null,
      content: content.trim(),
      tag: tag?.trim() || null,
    },
  });

  // New note is summary context → queue a re-summarization (ADR-0001).
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey) {
    await enqueueTask({ kind: "summarize", ticker });
  }

  return NextResponse.json(entry, { status: 201 });
}
