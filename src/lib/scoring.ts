import { parseStance } from "@/lib/db";

/** Opportunity bucket computed from P/B, claim verification rate, and AI stance. */

export type OpportunityBucket = "strong_buy" | "watch" | "pass";

export interface ScoringInput {
  pbRatio: number | null;
  /** The stance extracted from the AI summary (Bullish / Bearish / Neutral / null). */
  summary: string | null;
  totalClaims: number;
  /** Number of claims with status "supported". */
  supportedClaims: number;
  /** Number of claims with status "refuted". */
  refutedClaims: number;
}

/**
 * Assign a stock to one of three opportunity buckets.
 *
 * Rules (checked in order):
 *   🟢 STRONG BUY  — P/B < 1.0  AND  >50% of resolved claims are supported  AND  Bullish
 *   🟡 WATCH        — P/B < 1.5  AND  ≥30% of resolved claims are supported  AND  not Bearish
 *   ⚪ PASS         — everything else
 *
 * When P/B is missing (null), the stock always falls to Pass — we need price
 * data to assess "cheap."
 */
export function assignBucket(input: ScoringInput): OpportunityBucket {
  const stance = parseStance(input.summary);
  const resolved = input.supportedClaims + input.refutedClaims;
  const verificationRate = resolved > 0 ? input.supportedClaims / resolved : 0;

  const hasEnoughClaims = input.totalClaims >= 3;

  // Strong Buy
  if (
    input.pbRatio !== null &&
    input.pbRatio < 1.0 &&
    stance === "Bullish" &&
    (!hasEnoughClaims || verificationRate >= 0.5)
  ) {
    return "strong_buy";
  }

  // Watch
  if (
    input.pbRatio !== null &&
    input.pbRatio < 1.5 &&
    stance !== "Bearish" &&
    (!hasEnoughClaims || verificationRate >= 0.3)
  ) {
    return "watch";
  }

  // Pass
  return "pass";
}

/** Tailwind classes for bucket badges — matches the existing STANCE_COLORS pattern. */
export const BUCKET_COLORS: Record<OpportunityBucket, string> = {
  strong_buy:
    "text-green-400 border-green-400/30 bg-green-400/10",
  watch:
    "text-amber-400 border-amber-400/30 bg-amber-400/10",
  pass:
    "text-neutral-500 border-neutral-500/30 bg-neutral-500/10",
};

export const BUCKET_LABELS: Record<OpportunityBucket, string> = {
  strong_buy: "🟢 Strong Buy",
  watch: "🟡 Watch",
  pass: "⚪ Pass",
};
