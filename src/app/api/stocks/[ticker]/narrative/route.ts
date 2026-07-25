import { generateNarrative } from "@/lib/narrative";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/stocks/[ticker]/narrative
 *
 * Generate the conversational knowledge base narrative for a stock.
 * Must be called AFTER summarization — the narrative is a rewrite of the
 * analytical summary into the investor's voice.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "DEEPSEEK_API_KEY not configured" }, { status: 500 });
  }

  try {
    const narrative = await generateNarrative(ticker, apiKey);

    if (!narrative) {
      return NextResponse.json(
        { error: "No summary found. Run summarization first." },
        { status: 400 }
      );
    }

    return NextResponse.json({ narrative });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Narrative generation failed: ${e.message.slice(0, 200)}` },
      { status: 500 }
    );
  }
}
