import { prisma } from "@/lib/db";
import { runExtractions } from "@/lib/relationships";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: { ticker: string; id: string } }
) {
  const body = await req.json();
  const { status, evidence } = body;

  try {
    const data: Record<string, any> = {};
    if (status !== undefined) data.status = status;
    if (evidence !== undefined) data.evidence = evidence?.trim() || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const claim = await prisma.claim.update({
      where: { id: parseInt(params.id) },
      data,
    });

    // Re-extract relationships and contrarian angles when claim status or evidence changes
    const ticker = params.ticker.toUpperCase();
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (apiKey) {
      runExtractions(ticker, apiKey);
    }

    return NextResponse.json(claim);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
