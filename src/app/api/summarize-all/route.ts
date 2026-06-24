import { prisma } from "@/lib/db";
import { summarizeStock, needsSummary } from "@/lib/summarize";
import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const stocks = await prisma.stock.findMany({
    include: { files: true, entries: true, claims: true },
  });

  const stale = stocks.filter(needsSummary);

  if (stale.length === 0) {
    return NextResponse.json({ summarized: 0, message: "All stocks are up to date" });
  }

  const results: { ticker: string; success: boolean; error?: string }[] = [];

  for (const stock of stale) {
    try {
      await summarizeStock(stock.ticker, apiKey);
      results.push({ ticker: stock.ticker, success: true });
    } catch (e: any) {
      results.push({ ticker: stock.ticker, success: false, error: e.message });
    }
  }

  const succeeded = results.filter((r) => r.success).length;

  return NextResponse.json({
    summarized: succeeded,
    failed: results.length - succeeded,
    results,
  });
}
