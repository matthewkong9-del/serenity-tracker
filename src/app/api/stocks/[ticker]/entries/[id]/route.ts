import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: { ticker: string; id: string } }
) {
  const body = await req.json();
  const { title, content, tag } = body;

  try {
    const entry = await prisma.entry.update({
      where: { id: parseInt(params.id) },
      data: {
        title: title?.trim() || null,
        content: content?.trim() || "",
        tag: tag?.trim() || null,
      },
    });
    return NextResponse.json(entry);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { ticker: string; id: string } }
) {
  try {
    await prisma.entry.delete({ where: { id: parseInt(params.id) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
