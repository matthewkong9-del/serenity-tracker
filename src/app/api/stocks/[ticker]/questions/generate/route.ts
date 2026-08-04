/**
 * POST /api/stocks/[ticker]/questions/generate
 *
 * Triggers AI question generation + reflection checking for a stock.
 * Runs synchronously (not queued) — returns counts immediately.
 */

import { prisma } from "@/lib/db";
import { generateQuestions, checkReflections } from "@/lib/questions";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();

  const stock = await prisma.stock.findUnique({
    where: { ticker },
    select: { id: true },
  });
  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const [questionResult, reflectionsFlagged] = await Promise.all([
      generateQuestions(ticker, apiKey),
      checkReflections(ticker, apiKey),
    ]);

    return NextResponse.json({
      newQuestions: questionResult.newCount,
      staleFlagged: questionResult.staleCount,
      reflectionsFlagged,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Generation failed" },
      { status: 500 }
    );
  }
}
