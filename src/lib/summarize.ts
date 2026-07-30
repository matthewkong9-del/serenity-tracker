import { prisma } from "@/lib/db";
import { chat } from "@/lib/deepseek";
import { logPipelineRun, completePipelineRun } from "@/lib/pipeline-log";
import { enqueueTask } from "@/lib/pending-tasks";

const SYSTEM_PROMPT = (
  ticker: string
) => `You are a skeptical supply-chain analyst. You work for the user, NOT for Serenity. Serenity's tweets are low-reliability opinions — uploaded documents are high-reliability evidence. Your job: find the CHOKEPOINTS.

Serenity's methodology (follow this):
1. Start from physical reality — is demand real and growing? What do the numbers say?
2. Map the supply chain — who depends on $${ticker}? Who does $${ticker} depend on?
3. Find the chokepoints — sole suppliers, high barriers, limited substitutes, regulatory gates
4. Look for asymmetric setups — small/mid-cap with hyperscaler exposure, ignored by market
5. Stress-test ruthlessly — what kills this thesis?

Be CONCISE. Short bullets. No paragraphs over 3 lines.

Data sources (by reliability):
- [TWEETS] = Serenity's speculation (LOW reliability — treat as hypotheses to test)
- [CLAIMS] = extracted from tweets, marked: ✅SUPPORTED / ⚠️UNVERIFIED / ❌REFUTED / 🔶DISPUTED
- [RELATIONSHIPS] = AI-extracted supply chain map, competitor/partner/supplier/moat/gap
- [CONTRARIAN] = AI-extracted devil's advocate angles
- [DOCUMENTS] = uploaded files (HIGH reliability — actual evidence)
- [NOTES] = user's research

FORMAT:

# $${ticker}

**Stance:** 🟢 Bullish / 🔴 Bearish / 🟡 Neutral
**Confidence:** X/5
**Chokepoint Depth:** X/5

## Supply Chain Position
- Where does $${ticker} sit? Upstream / midstream / downstream?
- Who depends on them? Who do they depend on?
- (2-3 bullets max)

## Chokepoint Analysis
- What does $${ticker} control that others NEED?
- Sole supplier of anything? High barriers to entry? Limited substitutes?
- Evidence quality: which claims are verified vs speculative?
- Chokepoint depth rating explanation (1-5):
  5 = irreplaceable sole-source, critical to entire supply chain, no substitutes
  4 = near-sole-source, very high barriers, limited substitutes
  3 = strong position but alternatives exist, moderate barriers
  2 = competitive but differentiated, some moat
  1 = commodity player, easily substituted, low barriers

## Demand Certainty
- Is the demand real and growing? What physical evidence?
- End-customer demand (not just intermediate orders)
- Secular trend or cyclical?

## Asymmetric Setup
- Market cap vs. opportunity size
- Hyperscaler / giant customer exposure?
- Ignored by market? (small cap, low coverage)

## Risk / Anti-thesis
- What kills this thesis? (use contrarian angles if available)
- Key assumption that, if wrong, collapses the investment case
- Bear case that smart people believe

## Evidence Quality
- Verified claims: X/Y (Z%)
- Source quality: high-tier (official filings) vs low-tier (social media)
- Biggest gap: what do we NEED to know but DON'T?

## Verdict
**Stance:** 🟢 Bullish / 🔴 Bearish / 🟡 Neutral
**Confidence:** X/5
**Chokepoint Depth:** X/5
**Bottom Line:** 1-2 sentences. What's proven vs what's speculation.`;

// ── Chokepoint depth parser ────────────────────────────────────────────────
// Extracts "**Chokepoint Depth:** X/5" or "Chokepoint Depth: X/5" from summary text.

export function parseChokepointDepth(summary: string | null): number | null {
  if (!summary) return null;
  const match = summary.match(/(?:\*\*)?Chokepoint Depth:(?:\*\*)?\s*(\d)\/5/i);
  return match ? parseInt(match[1]) : null;
}

interface StockWithData {
  ticker: string;
  files: { originalName: string; fileType: string; markdown: string | null }[];
  notes: { title: string | null; content: string; tag: string | null }[];
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
      const statusLabel =
        {
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

  // 4. Relationships (supply chain map)
  const relationships = await prisma.relationship.findMany({
    where: { stock: { ticker: stock.ticker } },
    select: { type: true, target: true, description: true, sourceConfidence: true, section: true },
  });

  const known = relationships.filter((r) => r.section === "known");
  const contrarian = relationships.filter((r) => r.section === "contrarian");

  if (known.length > 0) {
    sections.push("--- RELATIONSHIPS (AI-extracted supply chain map) ---");
    for (const r of known) {
      const conf = r.sourceConfidence === "confirmed" ? "✓" : r.sourceConfidence === "gap" ? "?" : "~";
      sections.push(`[${r.type}: ${r.target}] ${conf} ${r.description || ""}`);
    }
  }

  if (contrarian.length > 0) {
    sections.push("--- CONTRARIAN ANGLES (devil's advocate — what to worry about) ---");
    for (const r of contrarian) {
      sections.push(`[${r.type}: ${r.target}] ${r.description || ""}`);
    }
  }

  // 5. Notes
  if (stock.notes.length > 0) {
    sections.push("--- NOTES (user's own research) ---");
    for (const entry of stock.notes) {
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
      notes: true,
      claims: {
        include: { tweet: { select: { content: true, timestamp: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!stock) throw new Error("Not found");

  const context = await buildContext(stock);

  if (!context.trim())
    throw new Error("No content to summarize. Add tweets, files, or notes first.");

  const runId = await logPipelineRun({
    stage: "summarize",
    status: "started",
    stockTicker: ticker,
    stockId: stock.id,
    input: {
      fileCount: stock.files.length,
      noteCount: stock.notes.length,
      claimCount: stock.claims.length,
    },
  });

  try {
    const summaryText = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT(ticker) },
        { role: "user", content: `DATA TO ANALYZE:\n\n${context}` },
      ],
      apiKey,
      { temperature: 0.3, purpose: "summarize" }
    );

    const chokepointDepth = parseChokepointDepth(summaryText);

    await prisma.stock.update({
      where: { ticker },
      data: {
        summary: summaryText,
        lastSummaryAt: new Date(),
        chokepointDepth,
      },
    });

    // Queue the follow-on chain: re-extract relationships + regenerate the
    // narrative. Replaces the dead stock:summarized event + the inline calls
    // that used to live in orchestratorTick (ADR-0001).
    await enqueueTask({ kind: "extract", ticker });
    await enqueueTask({ kind: "narrative", ticker });

    if (runId) {
      await completePipelineRun(runId, {
        status: "completed",
        output: {
          summaryLength: summaryText.length,
          chokepointDepth,
        },
        decision: `Summary generated. Chokepoint depth: ${chokepointDepth ?? "not rated"}/5.`,
      });
    }

    return summaryText;
  } catch (e: any) {
    if (runId) {
      await completePipelineRun(runId, {
        status: "failed",
        error: e.message?.slice(0, 500) || "Unknown error",
        decision: "Summary generation failed.",
      });
    }
    throw e;
  }
}

export function needsSummary(stock: {
  lastSummaryAt: Date | null;
  files: { createdAt: Date }[];
  notes: { createdAt: Date }[];
  claims: { createdAt: Date; updatedAt: Date }[];
}): boolean {
  if (!stock.lastSummaryAt) return true;
  return (
    stock.files.some((f) => new Date(f.createdAt) > new Date(stock.lastSummaryAt!)) ||
    stock.notes.some((e) => new Date(e.createdAt) > new Date(stock.lastSummaryAt!)) ||
    stock.claims.some(
      (c) =>
        new Date(c.createdAt) > new Date(stock.lastSummaryAt!) ||
        new Date(c.updatedAt) > new Date(stock.lastSummaryAt!)
    )
  );
}
