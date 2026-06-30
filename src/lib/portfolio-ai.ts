import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/deepseek";

/**
 * PORTFOLIO-AI.ts — LLM-powered portfolio analysis functions.
 * Ranking, thesis drift, maturity decisions — everything beyond basic summarization.
 */

// ── Claim ranking ──────────────────────────────────────────────

/**
 * Rank unverified claims by "most impactful to verify" using DeepSeek.
 * Returns empty array if no unverified claims or on error.
 */
export async function rankClaimsByImportance(
  ticker: string,
  apiKey: string
): Promise<{ claimId: number; priority: number; reason: string }[]> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    include: {
      claims: {
        where: { status: "unverified" },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!stock || stock.claims.length === 0) return [];

  const claimList = stock.claims
    .map((c, i) => {
      const parts = [`[Claim ${i + 1}]`];
      parts.push(c.text);
      if (c.source) parts.push(`Source: ${c.source}`);
      if (c.evidence) parts.push(`Existing evidence: ${c.evidence.slice(0, 300)}`);
      return parts.join("\n");
    })
    .join("\n\n");

  const prompt = `You are an investment research analyst. Rank the following unverified claims for $${ticker} by "most impactful to verify" — meaning, which claim, if resolved, would most change your confidence in the investment thesis.

For each claim, return its index number, priority (1 = highest impact), and a 1-sentence reason for the ranking.

CLAIMS:
${claimList}

Return ONLY valid JSON, no markdown:
{
  "rankedClaims": [
    {"claimIndex": 1, "priority": 1, "reason": "This claim directly addresses market share, the core of the bull thesis"},
    {"claimIndex": 3, "priority": 2, "reason": "NASDAQ listing is a major catalyst if confirmed"}
  ]
}

Only include claims worth prioritizing — skip claims that are vague opinions, personal takes, or price predictions. Max 5 ranked claims.`;

  try {
    const result = await chatJson<{
      rankedClaims: { claimIndex: number; priority: number; reason: string }[];
    }>([{ role: "user", content: prompt }], apiKey, { temperature: 0.2 });

    return (result.rankedClaims || [])
      .map((r) => ({
        claimId: stock.claims[r.claimIndex - 1]?.id ?? 0,
        priority: r.priority,
        reason: r.reason,
      }))
      .filter((r) => r.claimId > 0);
  } catch {
    return [];
  }
}

// ── Thesis drift ───────────────────────────────────────────────

export interface ThesisDriftResult {
  direction: "strengthening" | "weakening" | "holding" | "unclear";
  confidence: "high" | "medium" | "low";
  summary: string;
  shifts: { claim: string; status: string; impact: string }[];
}

export async function detectThesisDrift(
  ticker: string,
  apiKey: string
): Promise<ThesisDriftResult | null> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    select: {
      summary: true,
      claims: {
        select: { text: true, status: true, evidence: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!stock || !stock.summary) return null;

  const resolvedClaims = stock.claims.filter(
    (c) => c.status === "supported" || c.status === "refuted" || c.status === "disputed"
  );
  if (resolvedClaims.length === 0) return null;

  const claimsContext = stock.claims
    .map((c) => {
      const statusLabel =
        {
          unverified: "⚠️ UNVERIFIED",
          supported: "✅ SUPPORTED",
          refuted: "❌ REFUTED",
          disputed: "🔶 DISPUTED",
        }[c.status] || c.status;
      let entry = `[${statusLabel}] ${c.text}`;
      if (c.evidence) entry += `\n  Evidence: ${c.evidence.slice(0, 500)}`;
      return entry;
    })
    .join("\n\n");

  const prompt = `You are an investment analyst tracking thesis drift for $${ticker}.

Compare the AI-generated investment thesis (below) against the current claim verification landscape. Your job: detect whether the thesis is strengthening, weakening, or holding.

THESIS (from the last AI summary):
${stock.summary.slice(0, 3000)}

CURRENT CLAIM LANDSCAPE:
${claimsContext}

Return ONLY valid JSON, no markdown:
{
  "direction": "strengthening" | "weakening" | "holding" | "unclear",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentence verdict. Be specific — reference the claims and evidence that drove your conclusion.",
  "shifts": [
    {"claim": "the claim text", "status": "supported", "impact": "How this claim affects the thesis"}
  ]
}

Rules:
- "strengthening" = verified claims support the thesis, refuted claims are peripheral
- "weakening" = refuted claims undermine core thesis assumptions
- "holding" = mixed evidence, no clear directional shift
- "unclear" = not enough resolved claims to tell
- Only include shifts you actually used in your analysis. Max 5 shifts.
- Focus on claims that CHANGED status — if everything is still unverified, say "unclear" with "low" confidence.`;

  try {
    return await chatJson<ThesisDriftResult>([{ role: "user", content: prompt }], apiKey, {
      temperature: 0.2,
    });
  } catch {
    return null;
  }
}

// ── Portfolio attention ranking ────────────────────────────────

export interface PortfolioStockSummary {
  ticker: string;
  name: string | null;
  sector: string | null;
  stance: string | null;
  claimCounts: { unverified: number; supported: number; refuted: number; disputed: number };
  fileCount: number;
  hasSummary: boolean;
  hasExtractionError: boolean;
  daysSinceLastSummary: number | null;
}

export async function rankPortfolioAttention(
  stocks: PortfolioStockSummary[],
  apiKey: string
): Promise<{ ticker: string; urgency: number; reason: string }[]> {
  if (stocks.length === 0) return [];

  const sorted = [...stocks].sort((a, b) => {
    const score = (s: PortfolioStockSummary) =>
      s.claimCounts.unverified * 3 +
      (s.hasExtractionError ? 5 : 0) +
      (s.daysSinceLastSummary && s.daysSinceLastSummary > 4 ? s.daysSinceLastSummary : 0);
    return score(b) - score(a);
  });

  const candidates = sorted.slice(0, 25);

  const stockLines = candidates
    .map((s, i) => {
      const parts = [`[${i + 1}] $${s.ticker}`];
      if (s.name) parts.push(` — ${s.name}`);
      if (s.sector) parts.push(` (${s.sector})`);
      if (s.stance) parts.push(` | Stance: ${s.stance}`);
      parts.push(
        ` | Claims: ${s.claimCounts.unverified} unverified, ${s.claimCounts.supported} supported, ${s.claimCounts.refuted} refuted`
      );
      if (s.hasExtractionError) parts.push(` | ⚠️ Extraction error`);
      if (s.daysSinceLastSummary !== null) {
        parts.push(` | Last summary: ${s.daysSinceLastSummary}d ago`);
      } else {
        parts.push(` | No summary yet`);
      }
      parts.push(` | ${s.fileCount} files`);
      return parts.join("");
    })
    .join("\n");

  const prompt = `You are a portfolio manager reviewing your holdings. Rank the following stocks by URGENCY — which need the most immediate attention from your research team.

ATTENTION SIGNALS (in order of importance):
1. Many unverified claims (things you believe but haven't checked)
2. Extraction errors (something failed — needs fixing)
3. Stale or missing summaries (you don't know what's going on)
4. Refuted claims (the thesis may be wrong)
5. No documents uploaded (pure speculation with no evidence)

For each stock worth attention, return its number, urgency (1-10, where 10 = drop everything and look at this now), and a 1-sentence reason.

CANDIDATES:
${stockLines}

Return ONLY valid JSON, no markdown:
{
  "ranked": [
    {"stockIndex": 1, "urgency": 10, "reason": "18 unverified claims and no summary — completely unchecked thesis"},
    {"stockIndex": 3, "urgency": 8, "reason": "Extraction error + 5 refuted claims — thesis may be unraveling"}
  ]
}

Rank only stocks that genuinely need attention. Max 15 entries. Don't rank stocks with 0-1 unverified claims and a recent summary.`;

  try {
    const result = await chatJson<{
      ranked: { stockIndex: number; urgency: number; reason: string }[];
    }>([{ role: "user", content: prompt }], apiKey, { temperature: 0.3 });

    return (result.ranked || [])
      .map((r) => ({
        ticker: candidates[r.stockIndex - 1]?.ticker ?? "",
        urgency: Math.min(10, Math.max(1, r.urgency)),
        reason: r.reason,
      }))
      .filter((r) => r.ticker);
  } catch {
    return [];
  }
}

// ── Maturity ladder decisions ───────────────────────────────────

export async function generateDecisions(apiKey: string): Promise<{
  decisions: {
    ticker: string;
    maturity: string;
    action: string | null;
    reasoning: string;
  }[];
}> {
  const stocks = await prisma.stock.findMany({
    select: {
      ticker: true,
      name: true,
      summary: true,
      claims: { select: { status: true } },
      files: { select: { id: true } },
      relationships: { select: { id: true } },
    },
  });

  if (stocks.length === 0) return { decisions: [] };

  const stockLines = stocks
    .map((s, i) => {
      const counts = { unverified: 0, supported: 0, refuted: 0, disputed: 0 };
      for (const c of s.claims) counts[c.status as keyof typeof counts]++;

      const verifiedRate =
        s.claims.length > 0
          ? Math.round(((counts.supported + counts.refuted) / s.claims.length) * 100)
          : 0;

      const parts = [`[${i + 1}] $${s.ticker}`];
      if (s.name) parts.push(` — ${s.name}`);
      parts.push(
        ` | Claims: ${counts.unverified}u/${counts.supported}s/${counts.refuted}r (${verifiedRate}% resolved)`
      );
      parts.push(` | Files: ${s.files.length}`);
      parts.push(` | Relationships: ${s.relationships.length}`);
      if (s.summary) {
        parts.push(` | Summary: ${s.summary.slice(0, 300).replace(/\n/g, " ")}`);
      } else {
        parts.push(` | No summary`);
      }
      return parts.join("");
    })
    .join("\n");

  const prompt = `You are an investment portfolio manager. Classify each stock into a maturity ladder and for the most mature ones, recommend an action.

MATURITY LADDER:
- **beginning**: Few verified claims, no documents or summary. You're collecting information — the thesis is still forming.
- **core**: Some verified claims (20-50% resolved), documents uploaded, summary exists. The thesis is taking shape but not yet proven.
- **actionable**: High verification rate (50%+ claims resolved), multiple documents, confident summary, relationships mapped. You have enough to act.

For each actionable stock, recommend: **buy**, **hold**, or **sell**.

STOCKS:
${stockLines}

Return ONLY valid JSON, no markdown:
{
  "decisions": [
    {"stockIndex": 1, "maturity": "beginning", "action": null, "reasoning": "Only 2 unverified claims, no documents, no summary"},
    {"stockIndex": 3, "maturity": "actionable", "action": "buy", "reasoning": "75% of claims verified, 5 documents, confident Bullish stance"}
  ]
}

Include ALL stocks. Be honest — if there's not enough data, call it "beginning". That's fine.`;

  try {
    const result = await chatJson<{
      decisions: {
        stockIndex: number;
        maturity: string;
        action: string | null;
        reasoning: string;
      }[];
    }>([{ role: "user", content: prompt }], apiKey, { temperature: 0.2 });

    return {
      decisions: (result.decisions || [])
        .map((d) => ({
          ticker: stocks[d.stockIndex - 1]?.ticker ?? "",
          maturity: ["beginning", "core", "actionable"].includes(d.maturity)
            ? d.maturity
            : "beginning",
          action: d.action && ["buy", "hold", "sell"].includes(d.action) ? d.action : null,
          reasoning: d.reasoning,
        }))
        .filter((d) => d.ticker),
    };
  } catch {
    return { decisions: [] };
  }
}

// ── Deep research plan ──────────────────────────────────────────

export interface ResearchPlan {
  summary: string;
  priorityDocuments: string[];
  priorityClaims: { claimId: number; text: string; reason: string }[];
  gaps: string[];
  nextSteps: string[];
}

export async function generateResearchPlan(
  ticker: string,
  apiKey: string
): Promise<ResearchPlan | null> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    include: {
      files: { select: { originalName: true, fileType: true, markdown: true } },
      claims: {
        where: { status: "unverified" },
        select: { id: true, text: true },
      },
      relationships: { select: { type: true, target: true, description: true, confidence: true } },
    },
  });

  if (!stock) return null;

  const contextParts: string[] = [];
  contextParts.push(`Stock: $${ticker}`);

  if (stock.files.length > 0) {
    contextParts.push(`\nDocuments (${stock.files.length}):`);
    for (const f of stock.files) {
      const hasContent = f.markdown ? "✓ indexed" : "✗ not indexed";
      contextParts.push(`- ${f.originalName} (${f.fileType}) [${hasContent}]`);
    }
  }

  if (stock.claims.length > 0) {
    contextParts.push(`\nUnverified claims (${stock.claims.length}):`);
    for (const c of stock.claims) {
      contextParts.push(`- ${c.text.slice(0, 200)}`);
    }
  }

  if (stock.relationships.length > 0) {
    contextParts.push(`\nRelationships (${stock.relationships.length}):`);
    for (const r of stock.relationships) {
      contextParts.push(`- [${r.confidence}] ${r.type}: ${r.target}`);
    }
  }

  const prompt = `You are an investment research strategist. Create a RESEARCH PLAN for $${ticker} — what does this analyst need to do next to move this stock up the maturity ladder?

Given the current state, identify:
1. **Priority documents** to find (specific reports, filings, data sources — be concrete, not vague)
2. **Priority claims** to verify (which unverified claims would most change the thesis if resolved)
3. **Knowledge gaps** (what critical information is missing)
4. **Next steps** (concrete actions: "Find Q4 2025 earnings call transcript", "Search for competitor pricing data", etc.)

CONTEXT:
${contextParts.join("\n")}

Return ONLY valid JSON, no markdown:
{
  "summary": "1-2 sentence overview of the research situation",
  "priorityDocuments": ["Q4 2025 earnings transcript", "Competitor pricing analysis for X"],
  "priorityClaims": [{"claimId": 1, "text": "claim text", "reason": "why this matters most"}],
  "gaps": ["Missing market size data", "No recent financials"],
  "nextSteps": ["Find latest 10-K on SEC.gov", "Search Exa for 'LPKF revenue 2026'"]
}

Be specific and actionable. No generic advice like "do more research."`;

  try {
    return await chatJson<ResearchPlan>([{ role: "user", content: prompt }], apiKey, {
      temperature: 0.3,
    });
  } catch {
    return null;
  }
}
