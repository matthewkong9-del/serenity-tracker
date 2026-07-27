import { prisma } from "@/lib/db";
import { fetchStockMetrics as finnhubFetch } from "@/lib/finnhub";
import { fetchStockMetrics as yahooFetch } from "@/lib/yahoo";
import { fetchStockMetrics as avFetch } from "@/lib/alphavantage";
import { NextResponse } from "next/server";

/** POST /api/prices/refresh — called by daily cron.
 *  Phase 1: Finnhub for all stocks (price + P/B + market cap where available).
 *  Phase 2: Yahoo Finance for stocks Finnhub didn't price.
 *  Phase 3: Alpha Vantage for international stocks still missing market cap
 *           (free tier: 25 calls/day, throttled to 5/min). */
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
    orderBy: { id: "asc" },
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

  // ── Phase 3: Alpha Vantage for international stocks missing market cap ──
  // Free tier: 25 calls/day, 5 calls/min. Target only stocks with claims
  // (most important) that are still missing market cap after Finnhub.
  const avKey = process.env.ALPHA_VANTAGE_API_KEY;
  const AV_DAILY_LIMIT = 25;
  let avCalls = 0;
  let avFilled = 0;

  if (avKey) {
    const missingMcap = stocks.filter(
      (s) => !mcapMap.has(s.id) && !priceMap.has(s.id) === false // has price but no mcap
    );
    // Re-filter: has price, missing mcap
    const targets = stocks.filter((s) => !mcapMap.has(s.id));

    // Prioritize stocks with claims (more data → more important to score)
    const claimCounts = new Map<number, number>();
    const claims = await prisma.claim.groupBy({
      by: ["stockId"],
      _count: { id: true },
    });
    for (const c of claims) claimCounts.set(c.stockId, c._count.id);

    targets.sort((a, b) => {
      const ca = claimCounts.get(a.id) ?? 0;
      const cb = claimCounts.get(b.id) ?? 0;
      return cb - ca; // most claims first
    });

    console.log(
      `[prices] Phase 3 (Alpha Vantage): ${targets.length} stocks missing mcap, ` +
        `limit ${AV_DAILY_LIMIT}/day`
    );

    for (const s of targets) {
      if (avCalls >= AV_DAILY_LIMIT) break;

      // Throttle: 5 calls/min = 1 per 12s
      if (avCalls > 0) await new Promise((r) => setTimeout(r, 13_000));

      try {
        avCalls++;
        const m = await avFetch(s.ticker, s.sector);
        if (m.marketCap !== null) {
          mcapMap.set(s.id, m.marketCap);
          avFilled++;
        }
        if (m.pbRatio !== null && !pbMap.has(s.id)) {
          pbMap.set(s.id, m.pbRatio);
        }
      } catch (e: any) {
        console.warn(`[prices] alphavantage failed for ${s.ticker}: ${e.message}`);
      }
    }

    console.log(
      `[prices] Phase 3 done: ${avFilled}/${avCalls} calls filled mcap`
    );
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
    withMcap: mcapMap.size,
    total: stocks.length,
    fromFinnhub,
    fromYahoo,
    fromAlphaVantage: avFilled,
    avCalls,
  });
}
