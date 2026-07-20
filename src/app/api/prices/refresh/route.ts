import { prisma } from "@/lib/db";
import { fetchStockMetrics as finnhubFetch } from "@/lib/finnhub";
import { fetchStockMetrics as yahooFetch } from "@/lib/yahoo";
import { NextResponse } from "next/server";

/** POST /api/prices/refresh — called by daily cron.
 *  Phase 1: Finnhub for all stocks (rate-limited, provides price + P/B).
 *  Phase 2: Yahoo Finance for stocks Finnhub didn't cover (no API key needed). */
export async function POST() {
  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (!finnhubKey) {
    return NextResponse.json(
      { error: "FINNHUB_API_KEY not configured" },
      { status: 500 }
    );
  }

  const stocks = await prisma.stock.findMany({
    select: { id: true, ticker: true, sector: true },
  });

  const results = new Map<number, { price: number | null; pbRatio: number | null; source: string }>();

  // ── Phase 1: Finnhub (rate-limited: 60 calls/min) ──
  for (let i = 0; i < stocks.length; i++) {
    const s = stocks[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));

    try {
      const m = await finnhubFetch(s.ticker, s.sector);
      if (m.price !== null) {
        results.set(s.id, { price: m.price, pbRatio: m.pbRatio, source: "finnhub" });
      }
    } catch (e: any) {
      console.warn(`[prices] finnhub failed for ${s.ticker}: ${e.message}`);
    }
  }

  // ── Phase 2: Yahoo Finance for misses (no key, minimal delays) ──
  const missed = stocks.filter((s) => !results.has(s.id));

  if (missed.length > 0) {
    console.log(`[prices] ${missed.length} stocks missed by Finnhub, trying Yahoo...`);

    for (const s of missed) {
      try {
        const m = await yahooFetch(s.ticker, s.sector);
        if (m.price !== null) {
          results.set(s.id, { price: m.price, pbRatio: null, source: "yahoo" });
        }
      } catch (e: any) {
        console.warn(`[prices] yahoo failed for ${s.ticker}: ${e.message}`);
      }
      // Brief delay to avoid rate limiting from Yahoo
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // ── Persist ──
  let fromFinnhub = 0;
  let fromYahoo = 0;

  for (const [stockId, data] of Array.from(results.entries())) {
    await prisma.stock.update({
      where: { id: stockId },
      data: {
        currentPrice: data.price,
        pbRatio: data.pbRatio,
        lastPriceUpdated: new Date(),
      },
    });
    if (data.source === "finnhub") fromFinnhub++;
    else if (data.source === "yahoo") fromYahoo++;
  }

  const updated = results.size;
  const failed = stocks.length - updated;

  console.log(
    `[prices] refresh done: ${updated} updated (${fromFinnhub} finnhub, ${fromYahoo} yahoo), ${failed} failed out of ${stocks.length}`
  );
  return NextResponse.json({
    updated,
    failed,
    total: stocks.length,
    fromFinnhub,
    fromYahoo,
  });
}
