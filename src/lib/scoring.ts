import { parseStance } from "@/lib/db";

// ── Multi-factor scoring ───────────────────────────────────────────────────
// Replaces the old P/B-centric formula. Now weights:
//   chokepoint depth × evidence quality × market ignorance × asymmetric bonus × valuation discount

export type OpportunityBucket = "strong_buy" | "watch" | "pass";

export interface ScoringInput {
  // From DB
  chokepointDepth: number | null;   // 1-5, set by AI summary
  pbRatio: number | null;
  marketCap: number | null;         // from Finnhub
  currentPrice: number | null;
  summary: string | null;           // parsed for stance + asymmetric exposure
  totalClaims: number;
  supportedClaims: number;
  refutedClaims: number;
}

/**
 * Detect whether the summary mentions hyperscaler/giant-customer exposure —
 * a key asymmetric setup signal Serenity looks for.
 */
function hasAsymmetricExposure(summary: string | null): boolean {
  if (!summary) return false;
  const lowered = summary.toLowerCase();
  const signals = [
    "hyperscaler", "microsoft", "google", "amazon", "meta", "apple",
    "nvidia supplier", "nvda supplier", "tsmc supplier",
    "giant customer", "whale customer", "key supplier to",
    "sole supplier", "only qualified", "exclusive supplier",
    "supplier to apple", "supplier to nvidia", "supplier to tsmc",
    "ignored by market", "under-covered", "no analyst coverage",
    "small cap", "mid cap", "undiscovered", "under the radar",
  ];
  return signals.some((s) => lowered.includes(s));
}

/**
 * Convert market cap into a 1-5 "ignorance score".
 * Smaller companies = more likely ignored by the market = higher score.
 *
 * Rough buckets:
 *   < $500M  → 5 (nano-cap, barely covered)
 *   $500M-2B → 4 (small-cap)
 *   $2B-10B  → 3 (mid-cap)
 *   $10B-50B → 2 (large-cap, well covered)
 *   > $50B   → 1 (mega-cap, heavily covered)
 *   null     → 3 (unknown — assume average)
 */
function marketIgnoranceScore(marketCap: number | null): number {
  if (marketCap === null) return 3;
  if (marketCap < 0.5e9) return 5;
  if (marketCap < 2e9) return 4;
  if (marketCap < 10e9) return 3;
  if (marketCap < 50e9) return 2;
  return 1;
}

/**
 * Convert P/B ratio into a valuation bonus.
 *   P/B < 0.7  → 1.3 (deep value)
 *   P/B < 1.0  → 1.15 (cheap)
 *   P/B < 1.5  → 1.0  (fair)
 *   P/B >= 1.5 → 0.85 (expensive)
 *   null       → 1.0  (unknown)
 */
function valuationBonus(pbRatio: number | null): number {
  if (pbRatio === null) return 1.0;
  if (pbRatio < 0.7) return 1.3;
  if (pbRatio < 1.0) return 1.15;
  if (pbRatio < 1.5) return 1.0;
  return 0.85;
}

/**
 * Assign a stock to one of three opportunity buckets using the multi-factor model.
 *
 * Score = chokepointDepth × evidenceQuality × marketIgnorance × asymmetricBonus × valuationBonus
 *
 * Thresholds (score range roughly 0.3 – 30+):
 *   strong_buy: score ≥ 8  AND Bullish
 *   watch:      score ≥ 3  AND not Bearish
 *   pass:       everything else
 */
export function assignBucket(input: ScoringInput): OpportunityBucket {
  const stance = parseStance(input.summary);

  // ── Build the factors ──

  // 1. Chokepoint depth (1-5, default 2 if unknown)
  const chokepoint = input.chokepointDepth ?? 2;

  // 2. Evidence quality (0.5 – 1.0)
  //    Claims exist = at least floor of 0.5 (claims are evidence, even unverified).
  //    No claims at all = floor of 0.3 (nothing to work with).
  const resolved = input.supportedClaims + input.refutedClaims;
  const evidenceQuality =
    input.totalClaims === 0
      ? 0.3
      : Math.max(0.5, resolved > 0 ? input.supportedClaims / resolved : 0.5);

  // 3. Market ignorance (1-5)
  const ignorance = marketIgnoranceScore(input.marketCap);

  // 4. Asymmetric bonus (1.0 or 1.5)
  const asymmetricBonus = hasAsymmetricExposure(input.summary) ? 1.5 : 1.0;

  // 5. Valuation bonus (0.85 – 1.3)
  const valuation = valuationBonus(input.pbRatio);

  // ── Composite score ──
  const score = chokepoint * evidenceQuality * ignorance * asymmetricBonus * valuation;

  // ── Bucketing ──
  if (score >= 6 && stance === "Bullish") {
    return "strong_buy";
  }
  if (score >= 3 && stance !== "Bearish") {
    return "watch";
  }
  return "pass";
}

// ── UI helpers ──

export const BUCKET_COLORS: Record<OpportunityBucket, string> = {
  strong_buy: "text-green-400 border-green-400/30 bg-green-400/10",
  watch: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  pass: "text-neutral-500 border-neutral-500/30 bg-neutral-500/10",
};

export const BUCKET_LABELS: Record<OpportunityBucket, string> = {
  strong_buy: "🟢 Strong Buy",
  watch: "🟡 Watch",
  pass: "⚪ Pass",
};
