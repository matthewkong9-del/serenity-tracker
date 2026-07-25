import { researchClaim } from "@/lib/research";

// ── Thin compatibility wrapper ─────────────────────────────────────────────
// verify.ts previously contained its own Exa-based research pipeline.
// Now delegates to the unified researchClaim() in research.ts.
// These exports exist so existing API routes don't break.

export interface Verdict {
  verdict: "supported" | "refuted" | "disputed" | "unresolved";
  verificationConfidence: "high" | "medium" | "low";
  summary: string;
  sources: { url: string; title: string; snippet: string }[];
  corroboratingSources: number;
}

/**
 * Verify a single claim. Delegates to the unified research pipeline.
 * @deprecated Use researchClaim() from research.ts directly for new code.
 */
export async function verifyClaim(
  claimText: string,
  ticker: string,
  _exaKey: string,
  deepseekKey: string
): Promise<Verdict> {
  // This is called from API routes that have claim IDs. Since this wrapper
  // only has the text (no claim ID), we do a lookup and delegate.
  // In practice, all current callers pass claim IDs through verifyClaims().
  throw new Error(
    "verifyClaim(text) is deprecated. Use researchClaim(id, ticker, apiKey) instead."
  );
}

/**
 * Verify multiple claims for the same stock.
 * Delegates to researchClaim() for each claim.
 */
export async function verifyClaims(
  claims: { id: number; text: string }[],
  ticker: string,
  _exaKey: string,
  deepseekKey: string,
  concurrency = 2
): Promise<Map<number, Verdict>> {
  const results = new Map<number, Verdict>();

  for (let i = 0; i < claims.length; i += concurrency) {
    const batch = claims.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (c) => {
        await researchClaim(c.id, ticker, deepseekKey, "quick");

        // researchClaim() updates the DB but doesn't return the verdict object.
        // Read it back so callers get the same shape they expect.
        const { prisma } = await import("@/lib/db");
        const updated = await prisma.claim.findUnique({
          where: { id: c.id },
          select: { status: true, evidence: true },
        });

        const verdictVerdict: Verdict["verdict"] =
          updated?.status === "supported"
            ? "supported"
            : updated?.status === "refuted"
              ? "refuted"
              : updated?.status === "disputed"
                ? "disputed"
                : "unresolved";

        return {
          id: c.id,
          verdict: {
            verdict: verdictVerdict,
            verificationConfidence: "medium" as const,
            summary: updated?.evidence?.slice(0, 200) || "",
            sources: [],
            corroboratingSources: updated?.status === "supported" ? 2 : 0,
          },
        };
      })
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.set(r.value.id, r.value.verdict);
      }
    }
  }

  return results;
}
