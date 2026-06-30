import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: { ticker: string } }) {
  const stock = await prisma.stock.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
    include: { entries: { orderBy: { createdAt: "desc" } } },
  });
  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(stock.entries);
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

  const entry = await prisma.entry.create({
    data: {
      stockId: stock.id,
      title: title?.trim() || null,
      content: content.trim(),
      tag: tag?.trim() || null,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
