import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const stock = await prisma.stock.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
    include: { files: { orderBy: { createdAt: "desc" } } },
  });
  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(stock.files);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();
  const stock = await prisma.stock.findUnique({ where: { ticker } });
  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const description = formData.get("description") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const ext = file.name.split(".").pop() || "";
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await mkdir(`public/uploads/${ticker}`, { recursive: true });
  await writeFile(`public/uploads/${ticker}/${safeName}`, buffer);

  const saved = await prisma.file.create({
    data: {
      stockId: stock.id,
      filename: safeName,
      originalName: file.name,
      fileType: ext.toLowerCase(),
      fileSize: buffer.length,
      description: description || null,
    },
  });

  return NextResponse.json(saved, { status: 201 });
}
