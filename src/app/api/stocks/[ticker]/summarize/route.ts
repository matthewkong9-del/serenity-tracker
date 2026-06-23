import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const stock = await prisma.stock.findUnique({
    where: { ticker },
    include: { files: true, entries: true },
  });

  if (!stock) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let contextText = "--- TEXT NOTES ---\n";
  for (const entry of stock.entries) {
    if (entry.tag) contextText += `[Tag: ${entry.tag}]\n`;
    if (entry.title) contextText += `Title: ${entry.title}\n`;
    contextText += `${entry.content}\n\n`;
  }

  const textFiles = stock.files.filter(f => ["md", "txt"].includes(f.fileType));
  if (textFiles.length > 0) {
    contextText += "\n--- UPLOADED FILES ---\n";
    for (const file of textFiles) {
      try {
        const content = await readFile(`public/uploads/${ticker}/${file.filename}`, "utf-8");
        contextText += `\n[File: ${file.originalName}]\n${content}\n`;
      } catch {
        contextText += `\n[File: ${file.originalName}] - Error reading file\n`;
      }
    }
  }

  if (!contextText.trim() || (stock.entries.length === 0 && textFiles.length === 0)) {
    return NextResponse.json({ error: "No text content to summarize" }, { status: 400 });
  }

  const prompt = `You are an expert financial analyst assistant tracking a smart investor named "Serenity". 
Analyze the provided notes and documents regarding the stock $${ticker}.
Provide a highly structured, concise summary containing:
1. **Current Stance**: Bullish, Bearish, or Neutral (and why).
2. **Core Thesis**: The main underlying logic or narrative for this stock.
3. **Key Data Points**: Important numbers, prices, targets, or metrics mentioned.
4. **Catalysts & Risks**: What events could change the thesis?

Format the output cleanly using Markdown. Do not hallucinate information. If something is missing, say so.

DATA TO ANALYZE:
 ${contextText}`;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 500 });
    }

    const summaryText = data.choices[0].message.content;

    await prisma.stock.update({
      where: { ticker },
      data: {
        summary: summaryText,
        lastSummaryAt: new Date(),
      },
    });

    return NextResponse.json({ summary: summaryText });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to reach DeepSeek API" }, { status: 500 });
  }
}
