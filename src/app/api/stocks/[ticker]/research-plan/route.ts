import { generateResearchPlan } from "@/lib/portfolio-ai";
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
    const plan = await generateResearchPlan(ticker, apiKey);
    if (!plan) {
      return NextResponse.json(
        { error: "Could not generate research plan" },
        { status: 400 }
      );
    }
    return NextResponse.json(plan);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
