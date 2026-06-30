import { prisma } from "@/lib/db";
import { chat, chatJson } from "@/lib/deepseek";

const SYSTEM_PROMPT = (ticker: string) => `You are a skeptical analyst. You work for the user, NOT for Serenity. Serenity's tweets are opinions — documents are evidence. Your job: stress-test his thesis.

Be CONCISE. Use short bullets. No paragraphs over 3 lines. The user wants to scan, not study.

Data sources (by reliability):
- [TWEETS] = Serenity's speculation (low)
- [CLAIMS] = extracted from tweets, pre-marked: ✅SUPPORTED / ⚠️UNVERIFIED / ❌REFUTED / 🔶DISPUTED
- [DOCUMENTS] = uploaded files — actual evidence (high)
- [NOTES] = user's research

FORMAT — keep it clean and scannable:

# $${ticker}

**Stance:** 🟢 Bullish / 🔴 Bearish / 🟡 Neutral
**Confidence:** X/5
**Verdict:** STRONG BUY / SPECULATIVE / WAIT / PASS

## ✅ Supported (evidence from documents)
- Claim: ... → Doc says: ... (source)
- (skip this section if none)

## ⚠️ Unverified (needs research)
- Claim: ... → No document evidence yet
- (skip if none)

## ❌ Contradicted (docs disagree)
- Claim: ... → Doc actually says: ... (source)
- (skip if none)

## 🔑 Key Numbers (from documents only)
- Revenue: ... (source)
- Margins: ...
- Guidance: ...
- Risks flagged by company: ...

## 🕳️ Gaps
- What doc to find next (1-3 bullets max)

## Bottom Line
One sentence. What's proven vs what's speculation. Should the user dig deeper or move on?`;

interface StockWithData {
  ticker: string;
  files: { originalName: string; fileType: string; markdown: string | null }[];
  entries: { title: string | null; content: string; tag: string | null }[];
  claims: {
    text: string;
    source: string | null;
    status: string;
    evidence: string | null;
    tweet: { content: string; timestamp: Date | null } | null;
  }[];
}

async function buildContext(stock: StockWithData): Promise<string> {
  const sections: string[] = [];

  // 1. Tweets
  const tweets = await prisma.tweet.findMany({
    where: { claims: { some: { stock: { ticker: stock.ticker } } } },
    orderBy: { timestamp: "desc" },
    select: { content: true, timestamp: true },
  });

  if (tweets.length > 0) {
    sections.push("--- TWEETS (Serenity's statements — OPINIONS, NOT FACTS) ---");
    for (const t of tweets) {
      const date = t.timestamp ? new Date(t.timestamp).toLocaleDateString() : "unknown";
      sections.push(`[Tweet ${date}]\n${t.content}`);
    }
  }

  // 2. Claims
  if (stock.claims.length > 0) {
    sections.push("--- CLAIMS (extracted from tweets, with verification status) ---");
    for (const c of stock.claims) {
      const statusLabel = {
        unverified: "⚠️ UNVERIFIED",
        supported: "✅ SUPPORTED",
        refuted: "❌ REFUTED",
        disputed: "🔶 DISPUTED",
      }[c.status] || c.status;
      sections.push(`[${statusLabel}] ${c.text}`);
      if (c.evidence) sections.push(`  Evidence: ${c.evidence}`);
      if (c.source) sections.push(`  Source: ${c.source}`);
    }
  }

  // 3. Documents
  const filesWithContent = stock.files.filter((f) => f.markdown);
  if (filesWithContent.length > 0) {
    sections.push("--- DOCUMENTS (uploaded files — primary/secondary sources) ---");
    for (const file of filesWithContent) {
      sections.push(`[Document: ${file.originalName} (${file.fileType})]\n${file.markdown}`);
    }
  }

  // 4. Notes
  if (stock.entries.length > 0) {
    sections.push("--- NOTES (user's own research) ---");
    for (const entry of stock.entries) {
      if (entry.tag) sections.push(`[Tag: ${entry.tag}]`);
      if (entry.title) sections.push(`Title: ${entry.title}`);
      sections.push(`${entry.content}`);
    }
  }

  return sections.join("\n\n");
}

export async function summarizeStock(ticker: string, apiKey: string): Promise<string> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    include: {
      files: true,
      entries: true,
      claims: {
        include: { tweet: { select: { content: true, timestamp: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!stock) throw new Error("Not found");

  const context = await buildContext(stock);

  if (!context.trim()) throw new Error("No content to summarize. Add tweets, files, or notes first.");

  const summaryText = await chat(
    [
      { role: "system", content: SYSTEM_PROMPT(ticker) },
      { role: "user", content: `DATA TO ANALYZE:\n\n${context}` },
    ],
    apiKey,
    { temperature: 0.3 }
  );

  await prisma.stock.update({
    where: { ticker },
    data: {
      summary: summaryText,
      lastSummaryAt: new Date(),
    },
  });

  return summaryText;
}

export function needsSummary(stock: {
  lastSummaryAt: Date | null;
  files: { createdAt: Date }[];
  entries: { createdAt: Date }[];
  claims: { createdAt: Date }[];
}): boolean {
  if (!stock.lastSummaryAt) return true;
  return (
    stock.files.some((f) => new Date(f.createdAt) > new Date(stock.lastSummaryAt!)) ||
    stock.entries.some((e) => new Date(e.createdAt) > new Date(stock.lastSummaryAt!)) ||
    stock.claims.some((c) => new Date(c.createdAt) > new Date(stock.lastSummaryAt!))
  );
}

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

  // Build context: each claim with its index (1-based, safer than IDs for LLM)
  const claimList = stock.claims.map((c, i) => {
    const parts = [`[Claim ${i + 1}]`];
    parts.push(c.text);
    if (c.source) parts.push(`Source: ${c.source}`);
    if (c.evidence) parts.push(`Existing evidence: ${c.evidence.slice(0, 300)}`);
    return parts.join("\n");
  }).join("\n\n");

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

    return (result.rankedClaims || []).map((r) => ({
      claimId: stock.claims[r.claimIndex - 1]?.id ?? 0,
      priority: r.priority,
      reason: r.reason,
    })).filter((r) => r.claimId > 0);
  } catch {
    return [];
  }
}

/** Result of thesis drift analysis */
export interface ThesisDriftResult {
  direction: "strengthening" | "weakening" | "holding" | "unclear";
  confidence: "high" | "medium" | "low";
  summary: string;
  shifts: { claim: string; status: string; impact: string }[];
}

/**
 * Detect whether the investment thesis is strengthening, weakening, or holding
 * by comparing the AI summary against the current claim verification landscape.
 */
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

  // Only meaningful if there are verified or refuted claims
  const resolvedClaims = stock.claims.filter(
    (c) => c.status === "supported" || c.status === "refuted" || c.status === "disputed"
  );
  if (resolvedClaims.length === 0) return null;

  const claimsContext = stock.claims
    .map((c) => {
      const statusLabel = {
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

Analyze:
1. Does the verified evidence SUPPORT or UNDERMINE the core thesis?
2. Are refuted claims central to the thesis or peripheral?
3. Has the balance of evidence shifted since the thesis was written?

Return ONLY valid JSON, no markdown:
{
  "direction": "strengthening" | "weakening" | "holding" | "unclear",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentence verdict. Be specific — reference the claims and evidence that drove your conclusion.",
  "shifts": [
    {
      "claim": "the claim text",
      "status": "supported",
      "impact": "How this claim affects the thesis — supports it, undermines it, or is neutral"
    }
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
    return await chatJson<ThesisDriftResult>(
      [{ role: "user", content: prompt }],
      apiKey,
      { temperature: 0.2 }
    );
  } catch {
    return null;
  }
}

/** Stock summary for portfolio attention ranking */
interface PortfolioStockSummary {
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

/**
 * Rank stocks by "most urgent attention needed" using DeepSeek.
 * Feeds top candidates (most unverified claims, errors, stale) to the LLM.
 */
export async function rankPortfolioAttention(
  stocks: PortfolioStockSummary[],
  apiKey: string
): Promise<{ ticker: string; urgency: number; reason: string }[]> {
  if (stocks.length === 0) return [];

  // Sort candidates: high unverified count, extraction errors, stale summaries first
  const sorted = [...stocks].sort((a, b) => {
    const score = (s: PortfolioStockSummary) =>
      s.claimCounts.unverified * 3 +
      (s.hasExtractionError ? 5 : 0) +
      (s.daysSinceLastSummary && s.daysSinceLastSummary > 4 ? s.daysSinceLastSummary : 0);
    return score(b) - score(a);
  });

  // Send top 25 to the LLM
  const candidates = sorted.slice(0, 25);

  const stockLines = candidates.map((s, i) => {
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
  }).join("\n");

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

    return (result.ranked || []).map((r) => ({
      ticker: candidates[r.stockIndex - 1]?.ticker ?? "",
      urgency: Math.min(10, Math.max(1, r.urgency)),
      reason: r.reason,
    })).filter((r) => r.ticker);
  } catch {
    return [];
  }
}

/** Generate maturity ladder + buy/hold/sell decisions for all stocks */
export async function generateDecisions(
  apiKey: string
): Promise<{
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
      claims: {
        select: { status: true },
      },
      files: { select: { id: true } },
      relationships: { select: { id: true } },
    },
  });

  if (stocks.length === 0) return { decisions: [] };

  // Build compact summary per stock
  const stockLines = stocks.map((s, i) => {
    const counts = { unverified: 0, supported: 0, refuted: 0, disputed: 0 };
    for (const c of s.claims) counts[c.status as keyof typeof counts]++;

    const verifiedRate = s.claims.length > 0
      ? Math.round(((counts.supported + counts.refuted) / s.claims.length) * 100)
      : 0;

    const parts = [`[${i + 1}] $${s.ticker}`];
    if (s.name) parts.push(` — ${s.name}`);
    parts.push(` | Claims: ${counts.unverified}u/${counts.supported}s/${counts.refuted}r (${verifiedRate}% resolved)`);
    parts.push(` | Files: ${s.files.length}`);
    parts.push(` | Relationships: ${s.relationships.length}`);
    if (s.summary) {
      const summaryBrief = s.summary.slice(0, 300).replace(/\n/g, " ");
      parts.push(` | Summary: ${summaryBrief}`);
    } else {
      parts.push(` | No summary`);
    }
    return parts.join("");
  }).join("\n");

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
    {
      "stockIndex": 1,
      "maturity": "beginning",
      "action": null,
      "reasoning": "Only 2 unverified claims, no documents, no summary"
    },
    {
      "stockIndex": 3,
      "maturity": "actionable",
      "action": "buy",
      "reasoning": "75% of claims verified (8 supported, 2 refuted), 5 documents including earnings reports, confident Bullish stance"
    }
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
      decisions: (result.decisions || []).map((d) => ({
        ticker: stocks[d.stockIndex - 1]?.ticker ?? "",
        maturity: ["beginning", "core", "actionable"].includes(d.maturity)
          ? d.maturity
          : "beginning",
        action: d.action && ["buy", "hold", "sell"].includes(d.action) ? d.action : null,
        reasoning: d.reasoning,
      })).filter((d) => d.ticker),
    };
  } catch {
    return { decisions: [] };
  }
}
