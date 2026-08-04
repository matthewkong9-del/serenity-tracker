/**
 * GET/POST /api/stocks/[ticker]/annotations
 *
 * GET  — list all annotations for a stock
 * POST — create a new annotation (body: { section?, text })
 *         section is optional — null = freestyle reflection entry
 */

import { prisma } from "@/lib/db";
import { enqueueTask } from "@/lib/pending-tasks";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_SECTIONS = ["what", "chokepoint", "numbers", "risk", "bottom"];

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

  const annotations = await prisma.annotation.findMany({
    where: { stockId: stock.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, section: true, text: true, aiFlag: true, aiCheckedAt: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(annotations);
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
  const { section, text } = body as { section?: string | null; text?: string };

  // section is optional — null/absent = freestyle reflection
  if (section && !VALID_SECTIONS.includes(section)) {
    return NextResponse.json(
      { error: `Invalid section. Must be one of: ${VALID_SECTIONS.join(", ")} or omitted for a reflection` },
      { status: 400 }
    );
  }
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const annotation = await prisma.annotation.create({
    data: {
      stockId: stock.id,
      section: section || null,
      text: text.trim(),
    },
    select: { id: true, section: true, text: true, aiFlag: true, aiCheckedAt: true, createdAt: true, updatedAt: true },
  });

  // Freestyle reflection → trigger re-summarization so the executive brief
  // picks up the new learning.
  if (!section) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
      await enqueueTask({ kind: "summarize", ticker: params.ticker.toUpperCase() });
    }
  }

  return NextResponse.json(annotation, { status: 201 });
}
