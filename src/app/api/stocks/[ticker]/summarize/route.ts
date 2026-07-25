import { summarizeStock } from "@/lib/summarize";
import { generateNarrative } from "@/lib/narrative";
import { runExtractions } from "@/lib/relationships";
import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const summary = await summarizeStock(ticker, apiKey);

    // Re-extract relationships and contrarian angles after new summary
    runExtractions(ticker, apiKey);

    // Generate the knowledge base narrative (fire-and-forget — summary is already saved)
    void generateNarrative(ticker, apiKey).catch((e) =>
      console.error(`[narrative] generation for ${ticker} failed: ${e.message}`)
    );

    return NextResponse.json({ summary });
  } catch (e: any) {
    if (e.message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e.message === "No content to summarize. Add tweets, files, or notes first.") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to reach DeepSeek API" }, { status: 500 });
  }
}
