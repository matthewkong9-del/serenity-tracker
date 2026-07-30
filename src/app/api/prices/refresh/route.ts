import { prisma } from "@/lib/db";
import { refreshPrices } from "@/lib/market-data";
import { prodSources } from "@/lib/market-data-sources";
import { NextResponse } from "next/server";

/** POST /api/prices/refresh — called daily by the price agent and
 *  scripts/price-cron.sh.
 *
 *  Thin adapter: load stocks (+ claim counts for Alpha Vantage
 *  prioritization), delegate the multi-source strategy to refreshPrices(),
 *  persist the normalized metrics, and return the report. The fallback
 *  ordering, rate limits, AV budget, field merging, and FX normalization
 *  all live in src/lib/market-data.ts — testable without HTTP or API keys. */
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

  // Claim counts drive Alpha Vantage prioritization (its 25/day budget goes
  // to the stocks with the most research activity first).
  const claimCounts = new Map<number, number>();
  const claims = await prisma.claim.groupBy({ by: ["stockId"], _count: { id: true } });
  for (const c of claims) claimCounts.set(c.stockId, c._count.id);

  const refreshStocks = stocks.map((s) => ({
    id: s.id,
    ticker: s.ticker,
    sector: s.sector,
    priority: claimCounts.get(s.id) ?? 0,
  }));

  const report = await refreshPrices(refreshStocks, prodSources);

  // Persist — only stocks that got at least one value.
  for (const s of stocks) {
    const m = report.metrics.get(s.id);
    if (
      !m ||
      (m.price == null &&
        m.pbRatio == null &&
        m.marketCap == null &&
        m.peRatio == null &&
        m.week52High == null &&
        m.week52Low == null)
    )
      continue;

    await prisma.stock.update({
      where: { id: s.id },
      data: {
        currentPrice: m.price ?? undefined,
        currency: m.currency || "USD",
        priceUsd: m.priceUsd ?? undefined,
        pbRatio: m.pbRatio ?? undefined,
        peRatio: m.peRatio ?? undefined,
        week52High: m.week52High ?? undefined,
        week52Low: m.week52Low ?? undefined,
        marketCap: m.marketCap ?? undefined,
        lastPriceUpdated: new Date(),
      },
    });
  }

  console.log(
    `[prices] refresh done: ${report.priced} priced ` +
      `(finnhub ${report.bySource.finnhub ?? 0}, yahoo ${report.bySource.yahoo ?? 0}), ` +
      `${report.withPb} with P/B, ${report.withMcap} with mcap`
  );

  return NextResponse.json({
    priced: report.priced,
    withPb: report.withPb,
    withMcap: report.withMcap,
    total: report.total,
    fromFinnhub: report.bySource.finnhub ?? 0,
    fromYahoo: report.bySource.yahoo ?? 0,
    fromAlphaVantage: report.mcapBySource.alphavantage ?? 0,
    avCalls: report.callsBySource.alphavantage ?? 0,
  });
}
