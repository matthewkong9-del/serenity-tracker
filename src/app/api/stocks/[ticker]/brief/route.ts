import { generateSynthesis } from "@/lib/summarize";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/stocks/[ticker]/brief
 *
 * Generate the executive brief (decision brief) for a stock on demand.
 * Synthesis runs directly — the button on the stock page calls this.
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
    const synthesis = await generateSynthesis(ticker, apiKey);

    if (!synthesis) {
      return NextResponse.json(
        { error: "No research content found for this stock." },
        { status: 400 }
      );
    }

    return NextResponse.json({ synthesis });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Brief generation failed: ${e.message.slice(0, 200)}` },
      { status: 500 }
    );
  }
}
