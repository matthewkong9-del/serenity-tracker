import { describe, it, expect } from "vitest";
import {
  refreshPrices,
  FX_TO_USD,
  type MarketDataSource,
  type RefreshStock,
  type SourceMetrics,
} from "@/lib/market-data";

const NULLS: SourceMetrics = {
  price: null,
  currency: null,
  pbRatio: null,
  peRatio: null,
  marketCap: null,
  week52High: null,
  week52Low: null,
};

const FULL_PROVIDES: (keyof SourceMetrics)[] = [
  "price",
  "currency",
  "pbRatio",
  "marketCap",
  "peRatio",
  "week52High",
  "week52Low",
];

/** Build a fake source returning canned per-ticker metrics (over nulls). */
function fakeSource(
  name: string,
  provides: (keyof SourceMetrics)[],
  perTicker: Record<string, Partial<SourceMetrics>>,
  opts: Partial<MarketDataSource> = {},
  onFetch?: (ticker: string) => void,
): MarketDataSource {
  return {
    name,
    provides,
    rateLimitMs: 0,
    ...opts,
    fetch: async (ticker) => {
      onFetch?.(ticker);
      return { ...NULLS, ...perTicker[ticker] };
    },
  };
}

const stock = (id: number, ticker: string, priority?: number): RefreshStock => ({
  id,
  ticker,
  sector: null,
  priority,
});

describe("refreshPrices", () => {
  it("skips later sources once a stock is priced, and attributes it", async () => {
    const yahooCalls: string[] = [];
    const yahoo = fakeSource("yahoo", ["price", "currency"], {}, {}, (t) => yahooCalls.push(t));
    const finnhub = fakeSource("finnhub", FULL_PROVIDES, {
      AAPL: { price: 150, currency: "USD", pbRatio: 5, marketCap: 2000 },
    });

    const r = await refreshPrices([stock(1, "AAPL")], [finnhub, yahoo]);

    expect(yahooCalls).toHaveLength(0);
    expect(r.priced).toBe(1);
    expect(r.bySource.finnhub).toBe(1);
    expect(r.metrics.get(1)!.price).toBe(150);
  });

  it("falls back to the next source for price misses and merges fields", async () => {
    const finnhub = fakeSource("finnhub", FULL_PROVIDES, {
      AAPL: { pbRatio: 5, marketCap: 2000 }, // price missing
    });
    const yahoo = fakeSource("yahoo", ["price", "currency"], {
      AAPL: { price: 150, currency: "USD" },
    });

    const r = await refreshPrices([stock(1, "AAPL")], [finnhub, yahoo]);

    expect(r.priced).toBe(1);
    expect(r.bySource.yahoo).toBe(1);
    const m = r.metrics.get(1)!;
    expect(m.price).toBe(150);
    expect(m.pbRatio).toBe(5); // merged from finnhub
    expect(m.marketCap).toBe(2000); // merged from finnhub
    expect(m.priceUsd).toBe(150);
  });

  it("first source wins: a later source fills gaps but never overwrites", async () => {
    const finnhub = fakeSource("finnhub", FULL_PROVIDES, {
      X: { price: 100, pbRatio: 3, marketCap: 500 }, // currency missing → yahoo gets called
    });
    const yahoo = fakeSource("yahoo", ["price", "currency"], {
      X: { price: 999, currency: "EUR" }, // price should be ignored, currency filled
    });

    const r = await refreshPrices([stock(1, "X")], [finnhub, yahoo]);
    const m = r.metrics.get(1)!;

    expect(m.price).toBe(100); // finnhub wins
    expect(m.currency).toBe("EUR"); // yahoo fills the gap
    expect(m.priceUsd).toBeCloseTo(100 * FX_TO_USD.EUR, 5);
  });

  it("respects the daily budget, taking highest-priority stocks first", async () => {
    const avCalls: string[] = [];
    const av = fakeSource(
      "alphavantage",
      ["marketCap"],
      { A: { marketCap: 10 }, B: { marketCap: 20 }, C: { marketCap: 30 } },
      { dailyBudget: 2 },
      (t) => avCalls.push(t),
    );
    const finnhub = fakeSource("finnhub", FULL_PROVIDES, {}); // misses everything

    const stocks = [stock(1, "A", 1), stock(2, "B", 9), stock(3, "C", 5)];
    const r = await refreshPrices(stocks, [finnhub, av]);

    expect(avCalls).toEqual(["B", "C"]); // priority 9 then 5; A(1) skipped
    expect(r.callsBySource.alphavantage).toBe(2);
    expect(r.withMcap).toBe(2);
    expect(r.mcapBySource.alphavantage).toBe(2);
    expect(r.metrics.get(1)!.marketCap).toBeNull(); // A not served
  });

  it("normalizes foreign currency to USD", async () => {
    const finnhub = fakeSource("finnhub", FULL_PROVIDES, {
      KOR: { price: 100000, currency: "KRW", marketCap: 1000 },
    });

    const r = await refreshPrices([stock(1, "KOR")], [finnhub]);

    expect(r.metrics.get(1)!.priceUsd).toBeCloseTo(100000 * FX_TO_USD.KRW, 5);
  });

  it("accepts a custom FX table", async () => {
    const finnhub = fakeSource("finnhub", FULL_PROVIDES, { X: { price: 100, currency: "XYZ" } });

    const r = await refreshPrices([stock(1, "X")], [finnhub], { ...FX_TO_USD, XYZ: 0.5 });

    expect(r.metrics.get(1)!.priceUsd).toBe(50);
  });

  it("skips a source entirely when available() returns false (no calls, no waits)", async () => {
    const avCalls: string[] = [];
    const av = fakeSource(
      "alphavantage",
      ["marketCap"],
      { X: { marketCap: 999 } },
      { dailyBudget: 25, available: () => false },
      (t) => avCalls.push(t),
    );
    const finnhub = fakeSource("finnhub", FULL_PROVIDES, { X: { price: 10, currency: "USD" } }); // mcap missing

    const r = await refreshPrices([stock(1, "X")], [finnhub, av]);

    expect(avCalls).toHaveLength(0);
    expect(r.callsBySource.alphavantage ?? 0).toBe(0);
    expect(r.metrics.get(1)!.marketCap).toBeNull(); // AV never consulted
  });

  it("leaves a stock unpriced when every source misses, but still merges what it got", async () => {
    const finnhub = fakeSource("finnhub", FULL_PROVIDES, { Z: { pbRatio: 2 } }); // no price
    const yahoo = fakeSource("yahoo", ["price", "currency"], {});

    const r = await refreshPrices([stock(1, "Z")], [finnhub, yahoo]);

    expect(r.priced).toBe(0);
    const m = r.metrics.get(1)!;
    expect(m.price).toBeNull();
    expect(m.priceUsd).toBeNull();
    expect(m.pbRatio).toBe(2); // still merged
  });
});
