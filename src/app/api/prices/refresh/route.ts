import { prisma } from "@/lib/db";
import { fetchStockMetrics as finnhubFetch } from "@/lib/finnhub";
import { fetchStockMetrics as yahooFetch } from "@/lib/yahoo";
import { NextResponse } from "next/server";

/** POST /api/prices/refresh — called by daily cron.
 *  Phase 1: Finnhub for all stocks (price + P/B where available).
 *  Phase 2: Yahoo Finance for stocks Finnhub didn't price.
 *  P/B is tracked independently — Finnhub metrics may return P/B even
 *  when the quote endpoint returns no price (common for international stocks). */
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

  // Track price, P/B, and market cap independently
  const priceMap = new Map<number, { price: number; source: string }>();
  const pbMap = new Map<number, number>();
  const mcapMap = new Map<number, number>();

  // ── Phase 1: Finnhub (rate-limited: 60 calls/min) ──
  for (let i = 0; i < stocks.length; i++) {
    const s = stocks[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));

    try {
      const m = await finnhubFetch(s.ticker, s.sector);
      if (m.price !== null) {
        priceMap.set(s.id, { price: m.price, source: "finnhub" });
      }
      // Capture P/B even when price failed — metrics endpoint is independent
      if (m.pbRatio !== null) {
        pbMap.set(s.id, m.pbRatio);
      }
      if (m.marketCap !== null) {
        mcapMap.set(s.id, m.marketCap);
      }
    } catch (e: any) {
      console.warn(`[prices] finnhub failed for ${s.ticker}: ${e.message}`);
    }
  }

  // ── Phase 2: Yahoo Finance for price misses ──
  const missed = stocks.filter((s) => !priceMap.has(s.id));

  if (missed.length > 0) {
    console.log(
      `[prices] ${missed.length} stocks missed by Finnhub, trying Yahoo...`
    );

    for (const s of missed) {
      try {
        const m = await yahooFetch(s.ticker, s.sector);
        if (m.price !== null) {
          priceMap.set(s.id, { price: m.price, source: "yahoo" });
        }
      } catch (e: any) {
        console.warn(`[prices] yahoo failed for ${s.ticker}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // ── Persist ──
  let fromFinnhub = 0;
  let fromYahoo = 0;

  for (const s of stocks) {
    const pd = priceMap.get(s.id);
    const pb = pbMap.get(s.id) ?? null;

    if (pd || pb !== null) {
      await prisma.stock.update({
        where: { id: s.id },
        data: {
          currentPrice: pd?.price ?? undefined,
          pbRatio: pb,
          marketCap: mcapMap.get(s.id) ?? undefined,
          lastPriceUpdated: new Date(),
        },
      });

      if (pd?.source === "finnhub") fromFinnhub++;
      else if (pd?.source === "yahoo") fromYahoo++;
    }
  }

  console.log(
    `[prices] refresh done: ${priceMap.size} priced (${fromFinnhub} finnhub, ${fromYahoo} yahoo), ` +
      `${pbMap.size} with P/B`
  );

  return NextResponse.json({
    priced: priceMap.size,
    withPb: pbMap.size,
    total: stocks.length,
    fromFinnhub,
    fromYahoo,
  });
}
