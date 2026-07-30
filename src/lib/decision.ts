/**
 * Deep per-stock investment thesis generation.
 *
 * Unlike generateDecisions() in portfolio-ai.ts (which classifies ALL 237 stocks
 * in one shallow pass), this module does a focused deep-dive on a single stock:
 * full summary, all claims with evidence, relationships, scoring factors →
 * a buy/hold/sell recommendation with a 1-paragraph thesis and key risks.
 *
 * Used by the decision agent (src/agents/decision.ts) which processes the
 * top-scored opportunities daily.
 */

import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/deepseek";
import { assignBucket, type ScoringInput } from "@/lib/scoring";

// ── Types ──────────────────────────────────────────────────────────────────

export interface InvestmentThesis {
  action: "buy" | "hold" | "sell";
  confidence: "high" | "medium" | "low";
  thesis: string; // 1-paragraph investment thesis
  risks: string[]; // 2-4 key risks that could break the thesis
  catalysts: string[]; // 1-3 near-term catalysts
  timeHorizon: string; // e.g. "6-12 months", "1-3 years"
}

export interface ThesisResult {
  ticker: string;
  thesis: InvestmentThesis | null;
  error?: string;
}

// ── Core ────────────────────────────────────────────────────────────────────

/**
 * Generate a deep investment thesis for a single stock.
 *
 * Requires the stock to have a summary (the AI analysis). Gathers the full
 * context — claims with evidence, relationships, notes, scoring factors —
 * and asks DeepSeek to produce a buy/hold/sell recommendation.
 */
export async function generateInvestmentThesis(
  ticker: string,
  apiKey: string
): Promise<ThesisResult> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    select: {
      id: true,
      name: true,
      sector: true,
      summary: true,
      chokepointDepth: true,
      marketCap: true,
      pbRatio: true,
      currentPrice: true,
      claims: {
        select: { text: true, status: true, evidence: true },
        orderBy: { createdAt: "desc" },
      },
      relationships: {
        select: { type: true, target: true, description: true, sourceConfidence: true },
      },
      notes: {
        select: { title: true, content: true, tag: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!stock) return { ticker, thesis: null, error: "Stock not found" };
  if (!stock.summary) return { ticker, thesis: null, error: "No summary — run summarization first" };

  // ── Build the dossier ──────────────────────────────────────────────────

  const sections: string[] = [];

  // 1. Company info
  sections.push(`# ${stock.name || ticker} ($${ticker})`);
  if (stock.sector) sections.push(`Sector: ${stock.sector}`);
  sections.push("");

  // 2. AI Summary (the most signal-rich data)
  sections.push("## AI Research Summary");
  sections.push(stock.summary);
  sections.push("");

  // 3. Claims with evidence
  if (stock.claims.length > 0) {
    sections.push("## Claims (${stock.claims.length} total)");
    const statusOrder = ["supported", "refuted", "disputed", "unverified"];
    for (const status of statusOrder) {
      const group = stock.claims.filter((c) => c.status === status);
      if (group.length === 0) continue;
      const emoji = { supported: "✅", refuted: "❌", disputed: "🔶", unverified: "⚠️" }[status];
      sections.push(`\n### ${emoji} ${status.toUpperCase()} (${group.length})`);
      for (const c of group) {
        sections.push(`- ${c.text}`);
        if (c.evidence) {
          // Truncate long evidence for the prompt
          const short = c.evidence.length > 600 ? c.evidence.slice(0, 600) + "..." : c.evidence;
          sections.push(`  Evidence: ${short}`);
        }
      }
    }
    sections.push("");
  }

  // 4. Supply chain relationships
  if (stock.relationships.length > 0) {
    sections.push("## Supply Chain & Competitive Map");
    const known = stock.relationships.filter((r) => r.sourceConfidence !== "gap");
    const gaps = stock.relationships.filter((r) => r.sourceConfidence === "gap");
    if (known.length > 0) {
      for (const r of known) {
        const conf = r.sourceConfidence === "confirmed" ? "✓" : "~";
        sections.push(`- [${r.type}] ${r.target} ${conf} — ${r.description || ""}`);
      }
    }
    if (gaps.length > 0) {
      sections.push(`\nGaps / speculative:`);
      for (const r of gaps) {
        sections.push(`- [${r.type}] ${r.target} — ${r.description || ""}`);
      }
    }
    sections.push("");
  }

  // 5. Scoring summary
  const claimCounts = { supported: 0, refuted: 0, disputed: 0, unverified: 0 };
  for (const c of stock.claims) {
    if (c.status in claimCounts) claimCounts[c.status as keyof typeof claimCounts]++;
  }
  const scoringInput: ScoringInput = {
    chokepointDepth: stock.chokepointDepth,
    pbRatio: stock.pbRatio,
    marketCap: stock.marketCap,
    currentPrice: stock.currentPrice,
    summary: stock.summary,
    totalClaims: stock.claims.length,
    supportedClaims: claimCounts.supported,
    refutedClaims: claimCounts.refuted,
  };
  const bucket = assignBucket(scoringInput);
  const bucketLabel = { strong_buy: "Strong Buy", watch: "Watch", pass: "Pass" }[bucket];

  sections.push("## Quantitative Snapshot");
  sections.push(`- Scoring bucket: ${bucketLabel}`);
  sections.push(`- Chokepoint depth: ${stock.chokepointDepth ?? "not rated"}/5`);
  if (stock.marketCap) {
    const mcapB = stock.marketCap >= 1000 ? `$${(stock.marketCap / 1000).toFixed(1)}B` : `$${stock.marketCap.toFixed(0)}M`;
    sections.push(`- Market cap: ${mcapB}`);
  }
  if (stock.pbRatio) sections.push(`- P/B ratio: ${stock.pbRatio.toFixed(2)}`);
  if (stock.currentPrice) sections.push(`- Current price: $${stock.currentPrice.toFixed(2)}`);
  sections.push(
    `- Claim status: ${claimCounts.supported} supported, ${claimCounts.refuted} refuted, ${claimCounts.disputed} disputed, ${claimCounts.unverified} unverified`
  );
  sections.push("");

  // 6. Notes (truncated)
  if (stock.notes.length > 0) {
    sections.push("## Analyst Notes");
    for (const n of stock.notes.slice(0, 5)) {
      const prefix = n.tag ? `[${n.tag}] ` : "";
      const title = n.title ? `${n.title}: ` : "";
      const body = n.content.length > 400 ? n.content.slice(0, 400) + "..." : n.content;
      sections.push(`- ${prefix}${title}${body}`);
    }
    sections.push("");
  }

  const dossier = sections.join("\n");

  // ── Prompt ──────────────────────────────────────────────────────────────

  const prompt = `You are an experienced hedge fund analyst. You've been given the complete research dossier for $${ticker}. Your job: produce a clear, actionable investment recommendation.

Review ALL the evidence — the AI summary, every claim (supported, refuted, disputed, unverified), the supply chain map, and the quantitative data. Then decide.

DECISION RULES:
- **buy**: The thesis is well-supported by evidence. Verified claims outnumber refuted ones. The chokepoint is real. Valuation is reasonable. You'd put capital behind this.
- **hold**: The thesis has merit but key questions remain unanswered. Too many unverified claims. Evidence is mixed. Wait for more data.
- **sell**: The thesis is broken. Key claims are refuted. The chokepoint doesn't exist or is eroding. You'd exit this position.

CONFIDENCE:
- **high**: 3+ verified claims directly support the thesis, few or no refuted claims, documents back it up
- **medium**: Some evidence supports, some contradicts, or key data is missing
- **low**: Mostly unverified claims, thin evidence, high uncertainty

Be honest. "Hold" is the correct default when evidence is insufficient. Don't manufacture conviction.

DOSSIER:
${dossier}

Return ONLY valid JSON, no markdown:
{
  "action": "buy" | "hold" | "sell",
  "confidence": "high" | "medium" | "low",
  "thesis": "ONE paragraph (4-6 sentences) that captures the investment case. Be specific — name the chokepoint, cite verified claims, mention the biggest risk. This should read like a professional analyst's one-paragraph stock pitch.",
  "risks": ["Risk 1 — specific, not generic", "Risk 2", "Risk 3"],
  "catalysts": ["Near-term event or milestone that could move the stock", "Another catalyst if applicable"],
  "timeHorizon": "6-12 months" | "1-3 years" | "3+ years"
}

The thesis paragraph is the most important output — make it crisp, evidence-based, and useful to an investor deciding whether to act.`;

  try {
    const result = await chatJson<InvestmentThesis>(
      [{ role: "user", content: prompt }],
      apiKey,
      { temperature: 0.3, purpose: "investment_thesis" }
    );

    // Validate
    if (!["buy", "hold", "sell"].includes(result.action)) {
      result.action = "hold";
    }
    if (!["high", "medium", "low"].includes(result.confidence)) {
      result.confidence = "medium";
    }
    if (!result.thesis || result.thesis.length < 50) {
      return { ticker, thesis: null, error: "Thesis too short or empty" };
    }

    return { ticker, thesis: result };
  } catch (e: any) {
    return { ticker, thesis: null, error: e.message?.slice(0, 300) || "Unknown error" };
  }
}

/**
 * Persist a generated thesis to the Decision table.
 * Creates or updates the Decision row for this stock.
 */
export async function saveThesis(
  ticker: string,
  thesis: InvestmentThesis
): Promise<void> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    select: { id: true },
  });
  if (!stock) return;

  // Store the full thesis as JSON in reasoning so it's queryable,
  // plus use the action and maturity fields for the ladder UI.
  const reasoning = JSON.stringify({
    thesis: thesis.thesis,
    confidence: thesis.confidence,
    risks: thesis.risks,
    catalysts: thesis.catalysts,
    timeHorizon: thesis.timeHorizon,
  });

  await prisma.decision.upsert({
    where: { stockId: stock.id },
    create: {
      stockId: stock.id,
      maturity: "actionable", // deep thesis = stock is actionable
      action: thesis.action,
      reasoning,
    },
    update: {
      maturity: "actionable",
      action: thesis.action,
      reasoning,
    },
  });
}
