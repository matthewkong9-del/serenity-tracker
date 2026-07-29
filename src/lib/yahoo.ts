/**
 * Yahoo Finance unofficial API — no key required, global coverage.
 * Used as a free fallback for international stocks not covered by Finnhub.
 *
 * No P/B data available — price only. P/B still comes from Finnhub where available.
 */

// --------------- ticker mapping ---------------

/** Map a raw ticker to a list of Yahoo Finance symbols to try.
 *  Returns multiple candidates when the exchange is ambiguous. */
export function yahooSymbols(ticker: string, sector?: string | null): string[] {
  const t = ticker.toUpperCase().trim();

  // Known overrides — same mapping as finnhub.ts
  const OVERRIDES: Record<string, string[]> = {
    SAMSUNG: ["005930.KS"],
    "SK HYNIX": ["000660.KS"],
    LPKF: ["LPK.DE"],
    "002463": ["002463.SZ"],
  };
  if (OVERRIDES[t]) return OVERRIDES[t];

  // Already has a known suffix — pass through (but also try .TWO for .TW)
  if (/\.(TW|TWO|T|KS|KQ|HK|L|DE|F|PA|MC|MI|SW|AS|BR|SA|SZ|SS|JK|NS|BO|SN|CO|LS|TA|WA|VI|AX|OL|ST|BC|DU|HM|MU|SG|SI|KL|JK|MK|NZ|IL|ZH|IR|HE|RG)$/i.test(t)) {
    // Taiwan: also try .TWO (TPEx) in case the stock is on the other exchange
    if (/\.TW$/i.test(t)) return [t, t.replace(/\.TW$/i, ".TWO")];
    return [t];
  }

  // Japan: known 4-digit numeric tickers
  if (/^\d{4}$/.test(t)) {
    if (["9984", "6758", "6501", "6502", "6954", "6861", "6594", "6967"].includes(t))
      return [`${t}.T`];
    // Taiwan: other 4-digit → try .TW then .TWO
    return [`${t}.TW`, `${t}.TWO`];
  }

  // Korea: 6-digit numeric → .KS
  if (/^\d{6}$/.test(t)) return [`${t}.KS`];

  // European / unmarked tickers: try common exchange suffixes.
  // Ordered by likelihood for semiconductor/electronics stocks.
  return [
    t,           // try bare first (US)
    `${t}.DE`,   // Xetra (Germany)
    `${t}.F`,    // Frankfurt (Germany)
    `${t}.ST`,   // Stockholm (Sweden)
    `${t}.PA`,   // Paris (France)
    `${t}.L`,    // London (UK)
    `${t}.TO`,   // Toronto (Canada)
  ];
}

// --------------- types ---------------

export interface YahooMetrics {
  price: number | null;
  pbRatio: null; // Yahoo Finance chart API doesn't include P/B
  currency: string | null;
  exchangeName: string | null;
}

// --------------- API ---------------

const HOSTS = [
  "query2.finance.yahoo.com",
  "query1.finance.yahoo.com",
];

interface YahooChartMeta {
  regularMarketPrice?: number;
  currency?: string;
  exchangeName?: string;
  fullExchangeName?: string;
}

/** Fetch current price from Yahoo Finance chart API.
 *  Rotates hosts to avoid rate limiting. */
async function fetchChart(symbol: string): Promise<YahooChartMeta | null> {
  // Rotate hosts to spread load
  const host = HOSTS[Math.floor(Math.random() * HOSTS.length)];

  try {
    const res = await fetch(
      `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        // Avoid caching stale prices
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    return meta;
  } catch {
    return null;
  }
}

/** Fetch price for a ticker, trying multiple symbol variants.
 *  Same interface pattern as finnhub.fetchStockMetrics(). */
export async function fetchStockMetrics(
  ticker: string,
  sector?: string | null
): Promise<YahooMetrics> {
  const symbols = yahooSymbols(ticker, sector);

  for (const symbol of symbols) {
    const meta = await fetchChart(symbol);
    if (meta && meta.regularMarketPrice != null) {
      return {
        price: meta.regularMarketPrice,
        pbRatio: null,
        currency: meta.currency ?? null,
        exchangeName: meta.fullExchangeName ?? meta.exchangeName ?? null,
      };
    }
    // Small delay between attempts to avoid rate limiting
    if (symbols.length > 1) await new Promise((r) => setTimeout(r, 200));
  }

  return { price: null, pbRatio: null, currency: null, exchangeName: null };
}
