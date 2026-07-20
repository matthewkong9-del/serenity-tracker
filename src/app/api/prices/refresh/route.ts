import { prisma } from "@/lib/db";
import { fetchStockMetrics } from "@/lib/finnhub";
import { NextResponse } from "next/server";

/** POST /api/prices/refresh — called by daily cron.
 *  Fetches latest price + P/B from Finnhub for every stock. */
export async function POST() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FINNHUB_API_KEY not configured" }, { status: 500 });
  }

  const stocks = await prisma.stock.findMany({
    select: { id: true, ticker: true, sector: true },
  });

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < stocks.length; i++) {
    const s = stocks[i];

    // Respect Finnhub free-tier rate limit: 60 calls/min → ~1s between calls
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));

    try {
      const metrics = await fetchStockMetrics(s.ticker, s.sector);

      await prisma.stock.update({
        where: { id: s.id },
        data: {
          currentPrice: metrics.price,
          pbRatio: metrics.pbRatio,
          lastPriceUpdated: new Date(),
        },
      });

      if (metrics.price !== null) updated++;
    } catch (e: any) {
      console.error(`[prices] failed for ${s.ticker}: ${e.message}`);
      failed++;
    }
  }

  console.log(`[prices] refresh done: ${updated} updated, ${failed} failed out of ${stocks.length}`);
  return NextResponse.json({ updated, failed, total: stocks.length });
}
