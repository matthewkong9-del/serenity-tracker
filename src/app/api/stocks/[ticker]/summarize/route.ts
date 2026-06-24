import { summarizeStock } from "@/lib/summarize";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const summary = await summarizeStock(ticker, apiKey);
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
