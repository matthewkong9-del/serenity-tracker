import { chatJson } from "@/lib/deepseek";

interface ExaSearchResult {
  url: string;
  title: string;
  text: string;
  highlights: string[];
}

interface Verdict {
  verdict: "supported" | "refuted" | "disputed" | "unresolved";
  confidence: "high" | "medium" | "low";
  summary: string;
  sources: { url: string; title: string; snippet: string }[];
  corroboratingSources: number;
}

/**
 * Verify a single claim by searching the web via Exa and evaluating results
 * with DeepSeek. Exa free tier: 20,000 requests/month. Cost: $0.
 */
export async function verifyClaim(
  claimText: string,
  ticker: string,
  exaKey: string,
  deepseekKey: string
): Promise<Verdict> {
  // 1. Search the web for evidence via Exa (returns full page text)
  const searchQuery = `${ticker} ${claimText.slice(0, 200)}`;
  const searchResults = await exaSearch(searchQuery, exaKey);

  if (searchResults.length === 0) {
    return {
      verdict: "unresolved",
      confidence: "low",
      summary:
        "No relevant sources found on the web. Try a broader claim or add evidence manually.",
      sources: [],
      corroboratingSources: 0,
    };
  }

  // 2. Feed results to DeepSeek for verdict
  const context = searchResults
    .map((r, i) => {
      const highlights = r.highlights?.length ? `\nKey excerpts: ${r.highlights.join(" | ")}` : "";
      return `[Source ${i + 1}]\nTitle: ${r.title}\nURL: ${r.url}\nContent: ${r.text.slice(0, 3000)}${highlights}`;
    })
    .join("\n\n");

  const prompt = `You are a rigorous fact-checking analyst. Your job: evaluate the claim below against the provided web sources and return a verdict.

CLAIM: "${claimText}"
TICKER: $${ticker}

SOURCES:
${context}

Return ONLY valid JSON, no markdown:
{
  "verdict": "supported" | "refuted" | "disputed" | "unresolved",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentences explaining the verdict with specific data points from the sources. Include numbers and dates where available.",
  "corroboratingSources": 0,
  "sources": [
    {"url": "https://...", "title": "Article title", "snippet": "The specific sentence or data point that supports your verdict"}
  ]
}

MULTI-SOURCE REQUIREMENT (critical):
- "supported" REQUIRES at least 2 INDEPENDENT sources that confirm the claim with specific evidence. If only 1 source supports it, use "unresolved" instead and explain that more sources are needed.
- "refuted" = sources directly contradict the claim. 2+ sources refuting = stronger than 1.
- "disputed" = sources disagree with each other, evidence is mixed (requires conflicting sources)
- "unresolved" = sources don't address the claim, only tangentially, OR only a single source confirms (insufficient corroboration)

CONFIDENCE RULES (tied to source count):
- "high" confidence = 3+ independent credible sources agree, specific numbers cited
- "medium" confidence = 2 independent credible sources agree
- "low" confidence = single source, indirect evidence, thin/dated sources, or speculative connection

CORROBORATING SOURCES:
- Set "corroboratingSources" to the number of independent sources that support your verdict
- If verdict is "supported", this MUST be 2 or higher
- If verdict is "unresolved" due to single-source evidence, set it to 1
- If verdict is "refuted", set it to the number of refuting sources

OTHER RULES:
- If the claim involves future predictions (price targets, revenue forecasts), default to "unresolved" with "low" confidence — these cannot be fact-checked
- Only include sources you actually used. 1-3 sources max.
- Be honest about uncertainty. "Unresolved" is better than a wrong verdict. Single-source "supported" is NOT allowed.`;

  return chatJson<Verdict>([{ role: "user", content: prompt }], deepseekKey, { temperature: 0.1 });
}

/**
 * Verify multiple claims for the same stock. Runs in parallel with concurrency
 * limit to avoid rate-limiting.
 */
export async function verifyClaims(
  claims: { id: number; text: string }[],
  ticker: string,
  exaKey: string,
  deepseekKey: string,
  concurrency = 2
): Promise<Map<number, Verdict>> {
  const results = new Map<number, Verdict>();

  for (let i = 0; i < claims.length; i += concurrency) {
    const batch = claims.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((c) =>
        verifyClaim(c.text, ticker, exaKey, deepseekKey).then((v) => ({
          id: c.id,
          verdict: v,
        }))
      )
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.set(r.value.id, r.value.verdict);
      } else {
        results.set(claims[i + batchResults.indexOf(r)]?.id ?? 0, {
          verdict: "unresolved",
          confidence: "low",
          summary: `Verification error: ${r.reason?.message || "Unknown"}`,
          sources: [],
          corroboratingSources: 0,
        });
      }
    }
  }

  return results;
}

/** Call Exa /search API. Returns up to 5 results with full page text. */
async function exaSearch(query: string, apiKey: string): Promise<ExaSearchResult[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      numResults: 5,
      contents: { text: { maxCharacters: 3000 }, highlights: { numSentences: 3 } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa search failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  return (data.results || []).map((r: any) => ({
    url: r.url || "",
    title: r.title || "",
    text: r.text || "",
    highlights: r.highlights || [],
  }));
}
