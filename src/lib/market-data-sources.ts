/**
 * Production price sources for refreshPrices().
 *
 * Each adapter (finnhub/yahoo/alphavantage) already exports
 * fetchStockMetrics(ticker, sector); here we declare what each is consulted
 * for (`provides`) and its rate characteristics, and normalize the return to
 * the shared SourceMetrics shape. The strategy stays free of these details.
 */

import { fetchStockMetrics as finnhubFetch } from "@/lib/finnhub";
import { fetchStockMetrics as yahooFetch } from "@/lib/yahoo";
import { fetchStockMetrics as avFetch } from "@/lib/alphavantage";
import type { MarketDataSource, SourceMetrics } from "@/lib/market-data";

/** Fill unspecified fields with null so every source returns the full shape. */
function toMetrics(m: Partial<SourceMetrics>): SourceMetrics {
  return {
    price: null,
    currency: null,
    pbRatio: null,
    peRatio: null,
    marketCap: null,
    week52High: null,
    week52Low: null,
    ...m,
  };
}

/** Finnhub — primary source. Price + currency + P/B + market cap. ~60 calls/min. */
export const finnhubSource: MarketDataSource = {
  name: "finnhub",
  provides: ["price", "currency", "pbRatio", "marketCap", "peRatio", "week52High", "week52Low"],
  rateLimitMs: 1100,
  fetch: async (ticker, sector) => toMetrics(await finnhubFetch(ticker, sector)),
};

/** Yahoo Finance — price-only fallback for Finnhub misses. No key, no fundamentals. */
export const yahooSource: MarketDataSource = {
  name: "yahoo",
  provides: ["price", "currency"],
  rateLimitMs: 150,
  fetch: async (ticker, sector) => toMetrics(await yahooFetch(ticker, sector)),
};

/** Alpha Vantage — fundamentals-only fallback for market-cap misses.
 *  Free tier: 25 calls/day, 5 calls/min. Skipped entirely when no API key. */
export const alphavantageSource: MarketDataSource = {
  name: "alphavantage",
  provides: ["marketCap"],
  rateLimitMs: 13_000,
  dailyBudget: 25,
  available: () => !!process.env.ALPHA_VANTAGE_API_KEY,
  fetch: async (ticker, sector) => toMetrics(await avFetch(ticker, sector)),
};

/** Production source chain, best-first. */
export const prodSources: MarketDataSource[] = [finnhubSource, yahooSource, alphavantageSource];
