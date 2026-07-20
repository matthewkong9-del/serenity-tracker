/**
 * Finnhub API wrapper — free tier, 60 calls/minute.
 * Provides current price and P/B (Price-to-Book) ratio for any ticker.
 *
 * Finnhub free tier: https://finnhub.io/
 * Docs: https://finnhub.io/docs/api
 */

const API_KEY = () => process.env.FINNHUB_API_KEY!;

// --------------- international ticker mapping ---------------

/** Map a raw ticker (from the DB) to a Finnhub symbol.
 *  Mirrors the heuristic from PriceChart.tsx's tradingViewSymbol(). */
export function finnhubSymbol(ticker: string, sector?: string | null): string {
  const t = ticker.toUpperCase().trim();

  // Taiwan: 4-digit numeric → .TW suffix
  if (/^\d{4}$/.test(t)) return `${t}.TW`;

  // Japan: 4-digit numeric with different context → .T suffix
  if (/^\d{4}T?$/.test(t) && sector?.toLowerCase().includes("japan")) return `${t.replace(/T$/,"")}.T`;

  // Korea: 6-digit numeric → .KS suffix
  if (/^\d{6}$/.test(t)) return `${t}.KS`;

  // Hong Kong: 4-digit numeric → .HK suffix
  if (/^\d{4}\.HK$/i.test(t)) return t;

  // Default: US / pass-through
  return t;
}

// --------------- types ---------------

export interface StockMetrics {
  price: number | null;
  pbRatio: number | null;
  peRatio: number | null;
  marketCap: number | null;
  week52High: number | null;
  week52Low: number | null;
}

// --------------- API calls ---------------

interface FinnhubQuote {
  c: number;  // current price
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // previous close
}

export async function fetchQuote(symbol: string): Promise<FinnhubQuote | null> {
  const key = API_KEY();
  if (!key) throw new Error("FINNHUB_API_KEY not configured");

  const res = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`
  );
  if (!res.ok) return null;
  const data: FinnhubQuote = await res.json();
  return data.c === 0 && data.h === 0 ? null : data; // invalid ticker returns all zeros
}

interface FinnhubMetrics {
  metric?: {
    pbAnnual?: number;
    pbQuarterly?: number;
    peAnnual?: number;
    peQuarterly?: number;
    marketCapitalization?: number;
    "52WeekHigh"?: number;
    "52WeekLow"?: number;
  };
}

export async function fetchMetrics(symbol: string): Promise<FinnhubMetrics["metric"] | null> {
  const key = API_KEY();
  if (!key) throw new Error("FINNHUB_API_KEY not configured");

  const res = await fetch(
    `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${key}`
  );
  if (!res.ok) return null;
  const data: FinnhubMetrics = await res.json();
  return data.metric || null;
}

/** Combined convenience: fetch price AND P/B for a ticker in one call pair. */
export async function fetchStockMetrics(
  ticker: string,
  sector?: string | null
): Promise<StockMetrics> {
  const symbol = finnhubSymbol(ticker, sector);

  const [quote, metric] = await Promise.all([
    fetchQuote(symbol).catch(() => null),
    fetchMetrics(symbol).catch(() => null),
  ]);

  return {
    price: quote?.c ?? null,
    pbRatio: metric?.pbAnnual ?? metric?.pbQuarterly ?? null,
    peRatio: metric?.peAnnual ?? null,
    marketCap: metric?.marketCapitalization ?? null,
    week52High: metric?.["52WeekHigh"] ?? null,
    week52Low: metric?.["52WeekLow"] ?? null,
  };
}
