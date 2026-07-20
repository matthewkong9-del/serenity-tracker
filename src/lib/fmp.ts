/**
 * Financial Modeling Prep (FMP) API wrapper — free tier, 250 calls/day.
 * Fallback for international stocks not covered by Finnhub.
 *
 * FMP docs: https://site.financialmodelingprep.com/developer/docs
 */

const API_KEY = () => process.env.FMP_API_KEY!;

// --------------- ticker mapping ---------------

/** Map a raw ticker to an FMP symbol. Reuses the same international
 *  suffix conventions as Finnhub — FMP supports the same exchanges. */
export function fmpSymbol(ticker: string, sector?: string | null): string {
  const t = ticker.toUpperCase().trim();

  // Taiwan: 4-digit numeric → .TW
  if (/^\d{4}$/.test(t)) return `${t}.TW`;

  // Japan: 4-digit numeric in Japanese sector → .T
  if (/^\d{4}T?$/.test(t) && sector?.toLowerCase().includes("japan"))
    return `${t.replace(/T$/, "")}.T`;

  // Korea: 6-digit numeric → .KS
  if (/^\d{6}$/.test(t)) return `${t}.KS`;

  // Hong Kong: 4-digit with .HK extension already set
  if (/^\d{4}\.HK$/i.test(t)) return t;

  // Japan: tickers ending in .T
  if (/\.T$/i.test(t)) return t;

  return t;
}

// --------------- types ---------------

export interface FmpStockMetrics {
  price: number | null;
  pbRatio: number | null;
  peRatio: number | null;
  marketCap: number | null;
  week52High: number | null;
  week52Low: number | null;
}

// --------------- API calls ---------------

interface FmpQuote {
  symbol: string;
  price: number;
  marketCap?: number;
  dayHigh?: number;
  dayLow?: number;
}

/** Fetch current price from FMP quote endpoint. */
async function fetchQuote(symbol: string): Promise<FmpQuote | null> {
  const key = API_KEY();
  if (!key) return null;

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(symbol)}?apikey=${key}`
    );
    if (!res.ok) return null;
    const data: FmpQuote[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    // FMP returns 0 for invalid tickers
    return data[0].price > 0 ? data[0] : null;
  } catch {
    return null;
  }
}

interface FmpKeyMetrics {
  symbol: string;
  priceToBookRatioTTM?: number;
  peRatioTTM?: number;
  marketCapTTM?: number;
}

/** Fetch key metrics (P/B, P/E) from FMP TTM endpoint. */
async function fetchKeyMetrics(symbol: string): Promise<FmpKeyMetrics | null> {
  const key = API_KEY();
  if (!key) return null;

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${encodeURIComponent(symbol)}?apikey=${key}`
    );
    if (!res.ok) return null;
    const data: FmpKeyMetrics[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0];
  } catch {
    return null;
  }
}

/** Combined convenience: fetch price AND P/B for a ticker.
 *  Same interface as finnhub.fetchStockMetrics() so the refresh route
 *  can swap between them. */
export async function fetchStockMetrics(
  ticker: string,
  sector?: string | null
): Promise<FmpStockMetrics> {
  const symbol = fmpSymbol(ticker, sector);

  const [quote, metrics] = await Promise.all([
    fetchQuote(symbol),
    fetchKeyMetrics(symbol),
  ]);

  return {
    price: quote?.price ?? null,
    pbRatio: metrics?.priceToBookRatioTTM ?? null,
    peRatio: metrics?.peRatioTTM ?? null,
    marketCap: quote?.marketCap ?? metrics?.marketCapTTM ?? null,
    week52High: null, // FMP quote doesn't include 52-week range
    week52Low: null,
  };
}
