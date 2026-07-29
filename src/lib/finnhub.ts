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

  // Known overrides: text-name tickers from tweet extraction that need
  // numeric exchange codes, plus tickers with ambiguous regional patterns.
  const OVERRIDES: Record<string, string> = {
    SAMSUNG: "005930.KS",
    "SK HYNIX": "000660.KS",
    LPKF: "LPK.DE",          // German, not US
    "002463": "002463.SZ",   // Chinese Shenzhen, not Korean
    "6967": "6967.T",        // Japanese
  };
  if (OVERRIDES[t]) return OVERRIDES[t];

  // Already has an explicit exchange suffix — pass through
  if (/\.(TW|T|KS|KQ|SZ|SS|HK|DE|AS|TO|L|PA|VI|SW|CO|MC)$/i.test(t)) return t;

  // Japan: known 4-digit numeric tickers (e.g. 9984 Softbank)
  if (/^\d{4}$/.test(t)) {
    if (["9984", "6758", "6501", "6502", "6954", "6861", "6594", "6967"].includes(t))
      return `${t}.T`;
    // Taiwan: other 4-digit → .TW
    return `${t}.TW`;
  }

  // Korea: 6-digit numeric → .KS
  if (/^\d{6}$/.test(t)) return `${t}.KS`;

  // Canada: .A suffix → .TO
  if (/\.A$/i.test(t)) return t.replace(/\.A$/i, ".TO");

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
