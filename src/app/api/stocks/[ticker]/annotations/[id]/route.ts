import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { ticker: string; id: string } }
) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  await prisma.annotation.deleteMany({
    where: { id, stock: { ticker: params.ticker.toUpperCase() } },
  });

  return NextResponse.json({ ok: true });
}
