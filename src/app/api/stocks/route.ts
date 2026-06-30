import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const stocks = await prisma.stock.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      ticker: true,
      name: true,
      sector: true,
      summary: true,
      updatedAt: true,
      _count: { select: { files: true, notes: true, claims: true } },
    },
  });
  return NextResponse.json(stocks);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ticker, name, sector, notes } = body;

  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  try {
    const stock = await prisma.stock.create({
      data: {
        ticker: ticker.toUpperCase().trim(),
        name: name?.trim() || null,
        sector: sector?.trim() || null,
        notes: notes?.trim() || null,
      },
    });
    return NextResponse.json(stock, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Stock already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create stock" }, { status: 500 });
  }
}
