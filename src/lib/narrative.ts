import { prisma } from "@/lib/db";
import { chat } from "@/lib/deepseek";
import { logPipelineRun, completePipelineRun } from "@/lib/pipeline-log";

// ── Narrative Engine ───────────────────────────────────────────────────────
// Takes the analytical summary + all evidence, rewrites it in a
// conversational, evidence-backed style for the knowledge base.
//
// Voice: "the analyst friend who shows their work"
//   - Conversational: like a smart friend explaining it over coffee.
//   - Evidence-first: every claim backed by a specific source right next to it.
//   - Enjoyable to read, but never sacrifices accuracy for style.

const NARRATIVE_PROMPT = `You are a ghostwriter for an investor who makes real decisions with their own money. Your job: turn dry analyst notes into something they actually ENJOY reading — while keeping every fact traceable to a source.

VOICE:
- Write like a smart friend explaining a company over coffee. Conversational, direct, no jargon.
- Short paragraphs. Mix up sentence length. Read it aloud — if it sounds stiff, rewrite it.
- Be honest. If the evidence is thin, say so. If something is speculation, call it speculation.
- Use the investor's own style: they like finding chokepoints, asymmetric setups, and things the market hasn't priced in.

EVIDENCE RULES (CRITICAL):
- Every significant claim MUST cite a source right next to it: "LPKF is the only qualified glass substrate laser supplier (source: 2025 annual report, p.42)." Or "(source: claim #247, verified by 3 independent sources)."
- If a claim has NO evidence, say "Serenity believes..." or "The thesis suggests..." — don't state it as fact.
- Documents (annual reports, earnings calls) are HIGH reliability. Claims verified by multiple sources are MEDIUM. Unverified claims and tweets are LOW — treat them as hypotheses, not facts.
- If sources disagree, say so. "The annual report says X, but Q2 earnings showed Y."

STRUCTURE (write as flowing narrative, not bullet points):

**What They Do**
2-3 sentences. What does this company actually make or do? Who pays them and why? Keep it simple — if you can't explain it to someone at a dinner party, you're overcomplicating it.

**The Chokepoint**
Why does this company matter? What do they control that others NEED? Is there a sole-source situation, a regulatory gate, a technology lead that's hard to replicate? Be specific about the supply chain position. Who depends on them?

**The Numbers That Matter**
3-5 specific numbers with sources. Revenue? Margins? Market cap? P/B? What financial data tells the story? Skip the generic stuff — pick the numbers that would change someone's mind about this stock.

**What Could Go Wrong**
Be concrete. Not "market risk" — actual things. "If glass substrate adoption slips by 2 years, their revenue ramp collapses." "They have an ATM program — dilution could hit retail holders." "One customer is 60% of revenue." What's the worst case? What's the bear case that smart people actually believe? What would make you sell?

**The Bottom Line**
2-3 sentences. The simple thesis. If you had to explain this investment to a smart friend in 30 seconds, what would you say? Include the key number or fact that anchors the conviction.

CONTEXT — ANALYTICAL SUMMARY:
{summary}

CONTEXT — EVIDENCE:
{evidence}

Write ONLY the narrative. No preamble, no "here's your narrative" — just the story, starting with "**What They Do**".`;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate the knowledge base narrative for a stock.
 * Reads the analytical summary + all evidence, feeds them to DeepSeek
 * with a prompt tuned for conversational, evidence-backed writing.
 *
 * Stores the result in Stock.narrative.
 */
export async function generateNarrative(
  ticker: string,
  apiKey: string
): Promise<string | null> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    include: {
      files: { select: { originalName: true, fileType: true, markdown: true } },
      notes: { select: { title: true, content: true, tag: true } },
      claims: {
        select: {
          text: true,
          status: true,
          evidence: true,
          insightType: true,
          impactScore: true,
          tweet: { select: { content: true, timestamp: true } },
        },
        orderBy: { impactScore: "desc" },
      },
      relationships: {
        select: { type: true, target: true, description: true, sourceConfidence: true, section: true },
      },
    },
  });

  if (!stock) return null;
  if (!stock.summary) return null; // no summary → nothing to narrativize

  // ── Build the evidence section ──

  const evidenceParts: string[] = [];

  // Claims with status
  if (stock.claims.length > 0) {
    evidenceParts.push("### Claims\n");
    for (const c of stock.claims) {
      const statusLabel =
        { unverified: "⚠️ NOT VERIFIED", supported: "✅ VERIFIED", refuted: "❌ WRONG", disputed: "🔶 DISPUTED" }[c.status] || c.status;
      const impactLabel = c.impactScore ? ` [impact: ${c.impactScore}/5]` : "";
      evidenceParts.push(`- ${statusLabel}${impactLabel}: "${c.text}"`);
      if (c.evidence) evidenceParts.push(`  Research: ${c.evidence}`);
    }
  }

  // Documents
  const docsWithContent = stock.files.filter((f) => f.markdown);
  if (docsWithContent.length > 0) {
    evidenceParts.push("\n### Documents Uploaded\n");
    for (const f of docsWithContent) {
      evidenceParts.push(`- ${f.originalName} (${f.fileType}): ${f.markdown!.slice(0, 2000)}`);
    }
  }

  // Relationships
  if (stock.relationships.length > 0) {
    evidenceParts.push("\n### Supply Chain & Competitive Map\n");
    for (const r of stock.relationships) {
      const conf = r.sourceConfidence === "confirmed" ? "confirmed" : r.sourceConfidence === "gap" ? "gap in knowledge" : "speculative";
      evidenceParts.push(`- [${r.type}] ${r.target} (${conf}): ${r.description || ""}`);
    }
  }

  // Notes
  if (stock.notes.length > 0) {
    evidenceParts.push("\n### Investor's Own Notes\n");
    for (const n of stock.notes) {
      evidenceParts.push(`- ${n.title ? n.title + ": " : ""}${n.content}`);
    }
  }

  const evidenceText = evidenceParts.join("\n");

  // ── Generate narrative ──

  const prompt = NARRATIVE_PROMPT
    .replace("{summary}", stock.summary)
    .replace("{evidence}", evidenceText.slice(0, 8000)); // guard against context overflow

  const runId = await logPipelineRun({
    stage: "narrative",
    status: "started",
    stockTicker: ticker,
    stockId: stock.id,
    input: {
      summaryLength: stock.summary?.length ?? 0,
      evidenceLength: evidenceText.length,
    },
  });

  try {
    const narrative = await chat([{ role: "user", content: prompt }], apiKey, {
      temperature: 0.4,
      purpose: "narrative",
    });

    await prisma.stock.update({
      where: { ticker },
      data: { narrative: narrative.trim() },
    });

    if (runId) {
      await completePipelineRun(runId, {
        status: "completed",
        output: { narrativeLength: narrative.length },
        decision: "Narrative generated successfully.",
      });
    }

    return narrative.trim();
  } catch (e: any) {
    if (runId) {
      await completePipelineRun(runId, {
        status: "failed",
        error: e.message?.slice(0, 500),
        decision: "Narrative generation failed.",
      });
    }
    throw e;
  }
}
