/**
 * Alpha Vantage API wrapper — free tier, 25 calls/day, 5 calls/min.
 * Fallback for international stocks not covered by Finnhub/FMP.
 *
 * Alpha Vantage docs: https://www.alphavantage.co/documentation/
 */

const API_KEY = () => process.env.ALPHA_VANTAGE_API_KEY!;

// ── Exchange suffix mapping ────────────────────────────────────────────
// Alpha Vantage uses different suffixes than Finnhub/Yahoo.
// Mappings discovered from Alpha Vantage docs and testing.
//
// Known suffixes:
//   .DEX  — XETRA (Germany)
//   .LON  — London (UK)
//   .TRT  — TSX (Canada)
//   .TRV  — TSX Venture (Canada)
//   .SHH  — Shanghai (China)
//   .SHZ  — Shenzhen (China)
//   .BSE  — BSE (India)
//
// For Korea/Taiwan/Japan, Alpha Vantage may use the same suffixes as other
// providers (.KS/.TW/.T) or bare numeric codes. We try both.

const AV_EXCHANGE_MAP: Record<string, string[]> = {
  // Known mappings
  DE: [".DEX"],
  F:  [".DEX"],  // Frankfurt → try XETRA
  L:  [".LON"],
  PA: [".LON"],  // Paris → try London (often cross-listed)
  HK: [".HK"],
  SS: [".SHH"],  // Shanghai
  SZ: [".SHZ"],  // Shenzhen
  // For Korea/Taiwan/Japan, try standard suffix first, then bare
  KS: [".KS"],   // Korea — may or may not work
  KQ: [".KQ"],   // KOSDAQ
  TW: [".TW"],
  TWO:[".TWO"],  // TPEx
  T:  [".T"],    // Tokyo
};

interface AvOverview {
  MarketCapitalization?: string;
  PriceToBookRatio?: string;
  PERatio?: string;
  Name?: string;
  Exchange?: string;
  Currency?: string;
  Country?: string;
}

// ── Types ──

export interface AvStockMetrics {
  price: null;            // Alpha Vantage OVERVIEW doesn't include current price
  pbRatio: number | null;
  peRatio: number | null;
  marketCap: number | null;
  week52High: null;
  week52Low: null;
}

// ── Suffix resolution ──

/** Extract the exchange suffix from a ticker (e.g., "SHA.DE" → "DE").
 *  Returns null for bare US tickers. */
function exchangeSuffix(ticker: string): string | null {
  const t = ticker.toUpperCase().trim();
  // Match known multi-part patterns
  const m = t.match(/\.([A-Z]{1,4})$/);
  if (m) return m[1];
  // Numeric tickers: infer from length
  if (/^\d{6}$/.test(t)) return "KS";  // Korea
  if (/^\d{4}$/.test(t)) return "TW";  // Taiwan
  if (/^\d{4}T$/.test(t)) return "T";  // Japan
  return null; // US / unknown
}

/** Build Alpha Vantage symbol(s) to try for a given ticker.
 *  Returns up to 2 candidates to minimize wasted API calls. */
function avSymbols(ticker: string, sector?: string | null): string[] {
  const suffix = exchangeSuffix(ticker);
  const candidates = suffix ? AV_EXCHANGE_MAP[suffix] : null;
  if (candidates && candidates.length > 0) {
    const base = ticker.replace(/\.\w+$/, "");
    return candidates.map((s) => base + s);
  }
  // No known mapping — try bare ticker (works for US) and ticker as-is
  const bare = ticker.replace(/\.\w+$/, "");
  return bare !== ticker ? [ticker, bare] : [ticker];
}

// ── API call ──

/** Fetch company overview from Alpha Vantage.
 *  Returns null if the ticker isn't found or the rate limit is hit. */
async function fetchOverview(symbol: string): Promise<AvOverview | null> {
  const key = API_KEY();
  if (!key) return null;

  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${key}`
    );
    if (!res.ok) return null;
    const data: AvOverview & { Note?: string; Information?: string } = await res.json();

    // Rate limit message
    if (data.Note || data.Information) {
      console.warn(`[alphavantage] rate limited: ${data.Note || data.Information}`);
      return null;
    }

    // Empty object = no data for this symbol
    if (!data.MarketCapitalization && !data.Name) return null;

    return data;
  } catch {
    return null;
  }
}

// ── Public interface ──

/** Fetch metrics for a ticker via Alpha Vantage OVERVIEW.
 *  Same interface as finnhub.fetchStockMetrics().
 *  NOTE: Does NOT return current price — only fundamentals.
 *  Rate limit: 25 calls/day, 5 calls/min. Callers must throttle. */
export async function fetchStockMetrics(
  ticker: string,
  sector?: string | null
): Promise<AvStockMetrics> {
  const symbols = avSymbols(ticker, sector);

  for (const symbol of symbols) {
    const overview = await fetchOverview(symbol);
    if (overview) {
      const marketCap = overview.MarketCapitalization
        ? parseFloat(overview.MarketCapitalization)
        : null;
      // Alpha Vantage returns market cap in raw dollars. Convert to millions
      // to match Finnhub's unit convention.
      const marketCapM = marketCap ? marketCap / 1_000_000 : null;

      return {
        price: null,
        pbRatio: overview.PriceToBookRatio ? parseFloat(overview.PriceToBookRatio) : null,
        peRatio: overview.PERatio ? parseFloat(overview.PERatio) : null,
        marketCap: marketCapM,
        week52High: null,
        week52Low: null,
      };
    }
    // Only try next candidate if we have multiple (rare — don't burn calls)
    if (symbols.length > 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return { price: null, pbRatio: null, peRatio: null, marketCap: null, week52High: null, week52Low: null };
}
