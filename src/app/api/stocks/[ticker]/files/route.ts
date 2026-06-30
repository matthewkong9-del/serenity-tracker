import { prisma } from "@/lib/db";
import { runExtractions } from "@/lib/relationships";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET(_req: NextRequest, { params }: { params: { ticker: string } }) {
  const stock = await prisma.stock.findUnique({
    where: { ticker: params.ticker.toUpperCase() },
    include: { files: { orderBy: { createdAt: "desc" } } },
  });
  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(stock.files);
}

export async function POST(req: NextRequest, { params }: { params: { ticker: string } }) {
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

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const relPath = `public/uploads/${ticker}/${safeName}`;
  const absPath = `${process.cwd()}/${relPath}`;

  await mkdir(`public/uploads/${ticker}`, { recursive: true });
  await writeFile(relPath, buffer);

  // Convert to markdown using markit CLI (for non-md/txt files)
  let markdown: string | null = null;
  const textTypes = ["md", "txt", "log", "rst"];
  if (textTypes.includes(ext)) {
    markdown = buffer.toString("utf-8");
  } else {
    try {
      const { stdout } = await execAsync(`npx markit "${absPath}" -q`, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      markdown = stdout?.trim() || null;
    } catch (e: any) {
      console.error("markit conversion failed:", e.message || e);
    }
  }

  const saved = await prisma.file.create({
    data: {
      stockId: stock.id,
      filename: safeName,
      originalName: file.name,
      fileType: ext,
      fileSize: buffer.length,
      description: description || null,
      markdown,
    },
  });

  // Re-extract relationships and contrarian angles now that new evidence arrived
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey) {
    runExtractions(ticker, apiKey);
  }

  return NextResponse.json(saved, { status: 201 });
}
