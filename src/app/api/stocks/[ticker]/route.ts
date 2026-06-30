import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: { ticker: string } }) {
  const stock = await prisma.stock.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
    include: {
      files: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      claims: { orderBy: { createdAt: "desc" } },
      relationships: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!stock) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(stock);
}

export async function PUT(req: NextRequest, { params }: { params: { ticker: string } }) {
  const body = await req.json();
  const { name, sector, notes } = body;

  try {
    const stock = await prisma.stock.update({
      where: { ticker: params.ticker.toUpperCase() },
      data: {
        name: name?.trim() || null,
        sector: sector?.trim() || null,
        generalNotes: notes?.trim() || null,
      },
    });
    return NextResponse.json(stock);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { ticker: string } }) {
  try {
    // Delete associated files from disk
    const stock = await prisma.stock.findUnique({
      where: { ticker: params.ticker.toUpperCase() },
      include: { files: true },
    });

    if (stock) {
      const fs = await import("fs/promises");
      for (const file of stock.files) {
        try {
          await fs.unlink(`public/uploads/${params.ticker.toUpperCase()}/${file.filename}`);
        } catch {}
      }
      try {
        await fs.rmdir(`public/uploads/${params.ticker.toUpperCase()}`);
      } catch {}
    }

    await prisma.stock.delete({
      where: { ticker: params.ticker.toUpperCase() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
