import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { ticker: string; id: string } }
) {
  const fileRecord = await prisma.file.findUnique({
    where: { id: parseInt(params.id) },
    include: { stock: true },
  });

  if (!fileRecord) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await unlink(`public/uploads/${fileRecord.stock.ticker}/${fileRecord.filename}`);
  } catch {}

  await prisma.file.delete({ where: { id: fileRecord.id } });
  return NextResponse.json({ ok: true });
}
