/**
 * Market-data refresh strategy.
 *
 * The real logic of the daily price refresh — ordered multi-source
 * fallback, per-source rate limits, the Alpha Vantage daily budget with
 * claim-count prioritization, cross-source field merging, and FX→USD
 * normalization — lives here, behind one small interface.
 *
 * Price sources are injected, so the strategy is testable with fakes:
 * no HTTP, no database, no API keys. The route handler is a thin adapter
 * that loads stocks, calls refreshPrices(), and persists the result.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/** Everything a price source can tell us about a ticker. Every field is
 *  nullable: each source fills what it can, and the strategy merges across
 *  sources (first source wins). marketCap is in millions USD. */
export interface SourceMetrics {
  price: number | null;
  currency: string | null;
  pbRatio: number | null;
  peRatio: number | null;
  marketCap: number | null;
  week52High: number | null;
  week52Low: number | null;
}

/** A price source behind the market-data seam. */
export interface MarketDataSource {
  name: string;
  /** Fields this source is consulted for. A stock is offered to this source
   *  only while it is still missing at least one of these. `fetch` may return
   *  additional fields as a bonus — those are merged too. */
  provides: (keyof SourceMetrics)[];
  /** Delay between calls to this source, in ms. 0 = no throttle. */
  rateLimitMs: number;
  /** Max calls to this source per refresh. Budget-limited sources consume
   *  the highest-priority stocks first. */
  dailyBudget?: number;
  /** If present and false, the source is skipped entirely (no calls, no
   *  rate-limit waits) — e.g. Alpha Vantage when its API key is absent. */
  available?: () => boolean;
  fetch: (ticker: string, sector?: string | null) => Promise<SourceMetrics>;
}

/** A stock to refresh. `priority` orders budget-limited sources (higher first);
 *  the route fills it from claim counts. */
export interface RefreshStock {
  id: number;
  ticker: string;
  sector?: string | null;
  priority?: number;
}

/** Normalized result for one stock, ready to persist. */
export interface RefreshedMetrics extends SourceMetrics {
  priceUsd: number | null;
  priceSource: string | null; // which source priced it
}

export interface RefreshReport {
  metrics: Map<number, RefreshedMetrics>;
  priced: number;
  withPb: number;
  withMcap: number;
  total: number;
  /** Stocks priced by each source. */
  bySource: Record<string, number>;
  /** Market caps filled by each source (Alpha Vantage fills mcap, not price). */
  mcapBySource: Record<string, number>;
  /** Call attempts per source. */
  callsBySource: Record<string, number>;
}

// ── FX ──────────────────────────────────────────────────────────────────────

/** Approximate FX rates to USD. For precise conversion an FX API would be
 *  needed; kept here so the strategy is self-contained and overridable in tests. */
export const FX_TO_USD: Record<string, number> = {
  USD: 1.0,
  KRW: 0.00072,
  JPY: 0.0065,
  TWD: 0.032,
  CNY: 0.14,
  HKD: 0.128,
  EUR: 1.10,
  GBP: 1.27,
  CAD: 0.74,
  AUD: 0.67,
  SGD: 0.75,
  CHF: 1.13,
  SEK: 0.096,
  NOK: 0.094,
  DKK: 0.147,
  BRL: 0.20,
  INR: 0.012,
};

// ── Strategy ────────────────────────────────────────────────────────────────

const METRIC_KEYS = [
  "price",
  "currency",
  "pbRatio",
  "peRatio",
  "marketCap",
  "week52High",
  "week52Low",
] as const;

function emptyMetrics(): SourceMetrics {
  return { price: null, currency: null, pbRatio: null, peRatio: null, marketCap: null, week52High: null, week52Low: null };
}

/** Merge non-null fields from `incoming` into `acc`. First source wins:
 *  a field already set is never overwritten. Returns whether `marketCap`
 *  was newly filled, so the caller can attribute it. */
function mergeInto(acc: SourceMetrics, incoming: SourceMetrics): boolean {
  let filledMcap = false;
  for (const k of METRIC_KEYS) {
    const val = incoming[k];
    if (val == null || acc[k] != null) continue; // first source wins
    // Assign via Object.assign: a direct `acc[k] =` would be rejected because
    // the `acc[k] != null` check narrows the indexed LHS to `null`.
    Object.assign(acc, { [k]: val });
    if (k === "marketCap") filledMcap = true;
  }
  return filledMcap;
}

/** Does `m` still need at least one field in `provides`? */
function needs(m: SourceMetrics, provides: (keyof SourceMetrics)[]): boolean {
  return provides.some((k) => m[k] == null);
}

const delay = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

/**
 * Refresh metrics for a batch of stocks across ordered price sources.
 *
 * Sources are tried in order. For each source, every stock still missing one
 * of the source's `provides` fields is offered to it; budget-limited sources
 * take the highest-priority stocks first, up to `dailyBudget`. Non-null fields
 * are merged (first source wins). Prices are normalized to USD via `fxTable`.
 */
export async function refreshPrices(
  stocks: RefreshStock[],
  sources: MarketDataSource[],
  fxTable: Record<string, number> = FX_TO_USD,
): Promise<RefreshReport> {
  const merged = new Map<number, SourceMetrics>();
  for (const s of stocks) merged.set(s.id, emptyMetrics());

  const priceSource = new Map<number, string>();
  const mcapSource = new Map<number, string>();
  const callsBySource: Record<string, number> = {};

  for (const source of sources) {
    if (source.available && !source.available()) continue; // e.g. AV with no API key

    let candidates = stocks.filter((s) => needs(merged.get(s.id)!, source.provides));

    // Budget-limited sources spend their budget on the highest-priority stocks.
    if (source.dailyBudget != null) {
      candidates = candidates.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    for (let i = 0; i < candidates.length; i++) {
      if (source.dailyBudget != null && (callsBySource[source.name] ?? 0) >= source.dailyBudget) {
        break;
      }
      if (i > 0) await delay(source.rateLimitMs);

      const s = candidates[i];
      callsBySource[source.name] = (callsBySource[source.name] ?? 0) + 1;

      let result: SourceMetrics;
      try {
        result = await source.fetch(s.ticker, s.sector);
      } catch {
        continue; // a source failing for one ticker shouldn't abort the run
      }

      const acc = merged.get(s.id)!;
      const hadPrice = acc.price != null;
      const filledMcap = mergeInto(acc, result);
      if (!hadPrice && acc.price != null) priceSource.set(s.id, source.name);
      if (filledMcap) mcapSource.set(s.id, source.name);
    }
  }

  // Normalize to USD + tally.
  const metrics = new Map<number, RefreshedMetrics>();
  let priced = 0;
  let withPb = 0;
  let withMcap = 0;
  const bySource: Record<string, number> = {};
  const mcapBySource: Record<string, number> = {};

  for (const s of stocks) {
    const m = merged.get(s.id)!;
    const currency = m.currency || "USD";
    const rate = fxTable[currency] ?? 1.0;
    const priceUsd = m.price != null ? m.price * rate : null;
    const pSrc = priceSource.get(s.id) ?? null;

    if (m.price != null) priced++;
    if (m.pbRatio != null) withPb++;
    if (m.marketCap != null) withMcap++;
    if (pSrc) bySource[pSrc] = (bySource[pSrc] ?? 0) + 1;
    const mSrc = mcapSource.get(s.id);
    if (mSrc) mcapBySource[mSrc] = (mcapBySource[mSrc] ?? 0) + 1;

    metrics.set(s.id, { ...m, priceUsd, priceSource: pSrc });
  }

  return { metrics, priced, withPb, withMcap, total: stocks.length, bySource, mcapBySource, callsBySource };
}
