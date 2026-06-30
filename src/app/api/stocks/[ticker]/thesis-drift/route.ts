import { detectThesisDrift } from "@/lib/summarize";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const result = await detectThesisDrift(ticker, apiKey);
    if (!result) {
      return NextResponse.json(
        { error: "No summary or resolved claims available to detect drift" },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
