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

  // 6. Research Q&A — user's answered questions
  // Cast to access the optional joined fields (not on the base interface)
  const questions = (stock as any).questions as any[] | undefined;
  if (questions && questions.length > 0) {
    const answered = questions.filter((q) => q.answer);
    if (answered.length > 0) {
      sections.push("--- RESEARCH Q&A (investor's own findings) ---");
      for (const q of answered) {
        sections.push(`Q: ${q.question}`);
        sections.push(`A: ${q.answer}`);
        if (q.category) sections.push(`  Category: ${q.category}`);
      }
    }
  }

  // 7. Reflections — investor's learning journal
  const annotations = (stock as any).annotations as any[] | undefined;
  if (annotations && annotations.length > 0) {
    const freestyle = annotations.filter((a) => !a.section);
    if (freestyle.length > 0) {
      sections.push("--- REFLECTIONS (investor's own learning) ---");
      for (const a of freestyle.slice(0, 10)) {
        sections.push(`[${new Date(a.createdAt).toLocaleDateString()}] ${a.text}`);
      }
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
      questions: {
        where: { answer: { not: null } },
        select: { question: true, answer: true, category: true },
        orderBy: { answeredAt: "desc" },
      },
      annotations: {
        where: { section: null },
        select: { text: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
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
      { temperature: 0.3, purpose: "summarize", timeoutMs: 600_000 } // 10 min — full docs can be large
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
    // Narrative is NOT auto-regenerated — the story is stable and user-editable.
    // User can regenerate it manually via the "Regenerate story" button.

    // Fire-and-forget: generate research questions + check answer staleness.
    // Same pattern as generateNarrative — runs async, errors logged but never
    // block the summary response.
    const { generateQuestions } = await import("@/lib/questions");
    void generateQuestions(ticker, apiKey).catch((e) =>
      console.error(`[summarize] question generation failed for ${ticker}:`, e)
    );

    // Fire-and-forget: generate executive brief synthesis
    void generateSynthesis(ticker, apiKey).catch((e) =>
      console.error(`[summarize] synthesis generation failed for ${ticker}:`, e)
    );

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

// ── Executive Brief Synthesis ──────────────────────────────────────────────
// Generates a compact, scannable executive summary from ALL sources:
// claims, documents, notes, Q&A answers, reflections, relationships.
// Designed to be read in 30 seconds — the "at a glance" state of research.

const SYNTHESIS_PROMPT = `You are writing an executive brief for an investor who needs to understand a stock in 30 seconds.

Synthesize ALL available sources into a tight, scannable summary. The investor has already done their own research — include their Q&A findings and reflections.

SOURCES:
- Tweets & Claims (with verification status)
- Uploaded Documents (annual reports, filings, articles)
- User's Research Q&A (their own findings — HIGH reliability)
- User's Reflections (what they've learned)
- Relationships (supply chain map)

RULES:
- Be brief. This is not the full analysis — it's the headline version.
- Every claim MUST cite its source type: "(from Q3 filing)", "(your research)", "(verified claim)", "(unverified)"
- If the user has answered research questions, treat those as HIGH reliability.
- If sources disagree, note the conflict.
- Mention what's MISSING — the biggest gap in the research.

OUTPUT FORMAT (use exactly this structure):

**Stance:** 🟢 Bullish / 🔴 Bearish / 🟡 Neutral
**Confidence:** X/5
**Thesis:** One sentence — the core investment case.

**Key Evidence:**
- [source type] Fact or finding (2-4 bullets max)

**What's New:**
- What changed since the last analysis? New answers? New documents? (1-2 bullets)

**Biggest Gap:**
- What do we still need to know? (1 bullet)

**Research Progress:**
- X questions answered, Y reflections written`;

/**
 * Generate a 30-second executive brief synthesizing all research sources.
 * Stored in Stock.synthesis. Fire-and-forget — never throws.
 */
export async function generateSynthesis(
  ticker: string,
  apiKey: string
): Promise<string | null> {
  try {
    const stock = await prisma.stock.findUnique({
      where: { ticker },
      include: {
        files: { select: { originalName: true, fileType: true, markdown: true } },
        notes: { select: { title: true, content: true, tag: true } },
        claims: {
          select: { text: true, status: true, evidence: true },
          orderBy: { createdAt: "desc" },
        },
        questions: {
          select: { question: true, answer: true, category: true, status: true },
        },
        annotations: {
          where: { section: null },
          select: { text: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        relationships: {
          select: { type: true, target: true, description: true, sourceConfidence: true },
        },
      },
    });
    if (!stock) return null;

    // Build compact context
    const parts: string[] = [];

    // Claims summary
    if (stock.claims.length > 0) {
      parts.push("--- CLAIMS ---");
      const statuses = { supported: 0, refuted: 0, disputed: 0, unverified: 0 };
      for (const c of stock.claims) {
        const s = c.status as keyof typeof statuses;
        if (s in statuses) statuses[s]++;
      }
      parts.push(
        `Summary: ${statuses.supported} verified, ${statuses.refuted} refuted, ${statuses.disputed} disputed, ${statuses.unverified} unverified`
      );
      // Key claims only
      const key = stock.claims.filter((c) => c.status === "supported" || c.evidence).slice(0, 10);
      for (const c of key) {
        const label = { supported: "✅", refuted: "❌", disputed: "🔶", unverified: "⚠️" }[
          c.status
        ] || c.status;
        parts.push(`${label} ${c.text}${c.evidence ? ` (evidence: ${c.evidence.slice(0, 200)})` : ""}`);
      }
    }

    // Documents
    if (stock.files.length > 0) {
      parts.push("--- DOCUMENTS ---");
      for (const f of stock.files) {
        parts.push(`${f.markdown ? "✓" : "✗"} ${f.originalName} (${f.fileType})`);
      }
    }

    // Research Q&A
    const answered = stock.questions.filter((q) => q.answer);
    if (answered.length > 0) {
      parts.push("--- USER'S RESEARCH (HIGH RELIABILITY) ---");
      for (const q of answered.slice(0, 8)) {
        parts.push(`Q: ${q.question}\nA: ${q.answer!.slice(0, 400)}`);
      }
    }

    // Reflections
    if (stock.annotations.length > 0) {
      parts.push("--- USER'S REFLECTIONS ---");
      for (const a of stock.annotations.slice(0, 5)) {
        parts.push(`[${new Date(a.createdAt).toLocaleDateString()}] ${a.text.slice(0, 300)}`);
      }
    }

    // Relationships
    if (stock.relationships.length > 0) {
      parts.push("--- RELATIONSHIPS ---");
      for (const r of stock.relationships.slice(0, 10)) {
        const conf = r.sourceConfidence === "confirmed" ? "✓" : r.sourceConfidence === "gap" ? "?" : "~";
        parts.push(`${conf} ${r.type}: ${r.target} — ${(r.description || "").slice(0, 200)}`);
      }
    }

    // Notes
    if (stock.notes.length > 0) {
      parts.push("--- NOTES ---");
      for (const n of stock.notes.slice(0, 5)) {
        parts.push(`${n.title ? n.title + ": " : ""}${n.content.slice(0, 300)}`);
      }
    }

    const context = parts.join("\n\n");
    if (!context.trim()) return null;

    // Stats for the prompt
    const questionStats = `${answered.length}/${stock.questions.length} questions answered`;
    const reflectionCount = `${stock.annotations.length} reflections`;

    const synthesis = await chat(
      [
        { role: "system", content: SYNTHESIS_PROMPT },
        {
          role: "user",
          content: `Ticker: $${ticker}\n${questionStats}, ${reflectionCount}\n\nRESEARCH DATA:\n\n${context.slice(0, 12000)}`,
        },
      ],
      apiKey,
      { temperature: 0.3, purpose: "synthesis", timeoutMs: 180_000 }
    );

    await prisma.stock.update({
      where: { ticker },
      data: {
        synthesis,
        lastSynthesisAt: new Date(),
      },
    });

    return synthesis;
  } catch (e: any) {
    console.error(`[synthesis] failed for ${ticker}:`, e.message);
    return null;
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
