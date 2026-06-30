import { prisma } from "@/lib/db";
import { generateDecisions } from "@/lib/portfolio-ai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const result = await generateDecisions(apiKey);

    // Upsert Decision records
    for (const d of result.decisions) {
      const stock = await prisma.stock.findUnique({
        where: { ticker: d.ticker },
      });
      if (!stock) continue;

      await prisma.decision.upsert({
        where: { stockId: stock.id },
        create: {
          stockId: stock.id,
          maturity: d.maturity,
          action: d.action,
          reasoning: d.reasoning,
        },
        update: {
          maturity: d.maturity,
          action: d.action,
          reasoning: d.reasoning,
        },
      });
    }

    // Return decisions enriched with ticker
    const allDecisions = await prisma.decision.findMany({
      include: { stock: { select: { ticker: true } } },
    });

    return NextResponse.json({
      decisions: allDecisions.map((d) => ({
        ticker: d.stock.ticker,
        maturity: d.maturity,
        action: d.action,
        reasoning: d.reasoning,
      })),
      summary: {
        beginning: allDecisions.filter((d) => d.maturity === "beginning").length,
        core: allDecisions.filter((d) => d.maturity === "core").length,
        actionable: allDecisions.filter((d) => d.maturity === "actionable").length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
