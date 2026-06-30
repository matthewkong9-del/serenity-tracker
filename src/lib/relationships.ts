import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/deepseek";

interface RelationshipExtract {
  type: string;
  target: string;
  description?: string;
  sources?: string;
  sourceConfidence: "confirmed" | "speculative" | "gap";
}

async function buildContextForStock(ticker: string): Promise<string | null> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    include: {
      files: { select: { originalName: true, fileType: true, markdown: true } },
      notes: { select: { title: true, content: true, tag: true } },
      claims: {
        select: {
          text: true,
          source: true,
          status: true,
          evidence: true,
          tweet: { select: { content: true, timestamp: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!stock) return null;

  const sections: string[] = [];

  // Tweets with claims
  const tweets = await prisma.tweet.findMany({
    where: { claims: { some: { stock: { ticker } } } },
    orderBy: { timestamp: "desc" },
    select: { content: true, timestamp: true },
  });

  if (tweets.length > 0) {
    sections.push("--- TWEETS BY SERENITY ---");
    for (const t of tweets) {
      const date = t.timestamp ? new Date(t.timestamp).toLocaleDateString() : "unknown";
      sections.push(`[Tweet ${date}]\n${t.content}`);
    }
  }

  // Concepts linked to this stock's tweets
  const concepts = await prisma.concept.findMany({
    where: {
      tweets: {
        some: { tweet: { claims: { some: { stock: { ticker } } } } },
      },
    },
    select: { name: true, description: true, category: true },
  });

  if (concepts.length > 0) {
    sections.push("--- RELEVANT CONCEPTS ---");
    for (const c of concepts) {
      const cat = c.category ? ` [${c.category}]` : "";
      sections.push(`${c.name}${cat}${c.description ? `: ${c.description}` : ""}`);
    }
  }

  // Documents
  const docsWithContent = stock.files.filter((f) => f.markdown);
  if (docsWithContent.length > 0) {
    sections.push("--- DOCUMENTS ---");
    for (const f of docsWithContent) {
      sections.push(`[Document: ${f.originalName} (${f.fileType})]\n${f.markdown}`);
    }
  }

  // Notes
  if (stock.notes.length > 0) {
    sections.push("--- NOTES ---");
    for (const e of stock.notes) {
      const header = e.tag ? `[${e.tag}]` : "";
      if (e.title) sections.push(`${header} ${e.title}`);
      if (e.content) sections.push(e.content);
    }
  }

  if (sections.length === 0) return null;
  return sections.join("\n\n");
}

function buildRelationshipPrompt(ticker: string, context: string): string {
  return `You are an investment research analyst building a RELATIONSHIP MAP for $${ticker}. Your job: discover everything connected to this company that matters for an investment decision.

Given the data below (tweets, concepts, documents, notes), identify ALL meaningful relationships. Think broadly:

- **competitor**: another company competing in the same market
- **partner**: joint ventures, collaborations, customers, licensees
- **supplier**: supplies something to this company or its ecosystem
- **moat**: a sustainable competitive advantage — technology, IP, scale, network effects, regulatory barrier
- **policy**: government regulation, export control, subsidy, or political factor affecting the company
- **gap**: something you WANT to know but the data DOESN'T say — missing financials, unverified claims, documents you wish you had

You may discover NEW relationship types beyond these six — name them clearly if you do.

For each relationship, provide:
- **type**: lowercase label (use seeded types when they fit, create new ones when they don't)
- **target**: the company, technology, concept, policy, or question on the other end
- **description**: 1-2 sentences explaining the connection and why it matters
- **sources**: cite where this information came from. Use short labels like "[Tweet 2024-03-15]", "[Annual Report 2025 p.10]", "[Note: thesis]", "[Claim: ...]". Be specific — the user needs to trace every relationship back to evidence.
- **confidence**: "confirmed" (multiple sources agree), "speculative" (mentioned but not verified), or "gap" (missing information you need)

IMPORTANT: Gaps are as valuable as confirmed relationships. If the data mentions something intriguing but doesn't explain it — that's a gap. If you'd need an earnings report or industry data to verify something — that's a gap. Flag them aggressively.

Return ONLY valid JSON, no markdown:
{
  "relationships": [
    {
      "type": "supplier",
      "target": "Company X",
      "description": "Supplies Y component to $${ticker}. Mentioned in Q3 filing as critical vendor.",
      "sources": "[Annual Report 2025 p.42], [Tweet 2025-11-03]",
      "confidence": "confirmed"
    },
    {
      "type": "gap",
      "target": "Q4 earnings data",
      "description": "Last earnings report available is Q2. Need Q3/Q4 to verify revenue growth trajectory.",
      "sources": "[Annual Report 2025 — Q2 figures only]",
      "confidence": "gap"
    }
  ]
}

DATA TO ANALYZE:

${context}`;
}

function buildContrarianPrompt(ticker: string, context: string): string {
  return `You are a contrarian investment analyst. Your job: challenge every assumption and explore angles others might miss about $${ticker}. Think outside the box.

Given the data below, look for what's NOT being said. Look at the investment from angles that a bull or bear might overlook:

1. **What if the thesis is wrong?** — Identify the key assumption that, if broken, collapses the investment case. What evidence would prove it wrong?
2. **Who's the dark horse?** — Is there an under-the-radar competitor, technology, or trend that could disrupt this company's position?
3. **Second-order effects** — If the bullish thesis plays out, what adjacent market or company benefits unexpectedly?
4. **Macro wildcards** — What geopolitical, regulatory, or macro event would kill (or supercharge) this stock overnight?
5. **Contrarian narrative** — What's a credible bear case that smart people disagree on? What's the bull case that skeptics are missing?
6. **Hidden risk / hidden opportunity** — Something in the data that's easy to overlook but could matter enormously.

Be specific. Reference the actual data — tweets, documents, claims. Don't invent concerns from thin air; ground them in something the data hints at.

For each angle, provide:
- **type**: lowercase label describing the lens (e.g. "thesis risk", "dark horse", "second-order", "macro wildcard", "contrarian narrative", "hidden risk", "hidden opportunity" — or invent your own)
- **target**: the specific company, technology, event, or idea
- **description**: 2-3 sentences explaining the angle and why it's worth thinking about
- **sources**: what data triggered this thought. Use short labels like "[Tweet 2024-03-15]", "[Annual Report 2025 p.10]", "[Note: thesis]".
- **confidence**: use "speculative" for contrarian ideas (they're inherently uncertain), "confirmed" only if multiple sources point to the same angle

Return ONLY valid JSON, no markdown:
{
  "angles": [
    {
      "type": "thesis risk",
      "target": "Glass substrate adoption timeline",
      "description": "The entire bull case rests on glass substrates replacing silicon interposers by 2027. If adoption slips by 2 years, LPKF's revenue ramp collapses. TSMC's cautious language about glass in their last earnings call suggests this risk is real.",
      "sources": "[Annual Report 2025 p.10], [Tweet 2025-08-12]",
      "confidence": "speculative"
    }
  ]
}

DATA TO ANALYZE:

${context}`;
}

/** Run both extractions (map + contrarian) and persist any errors to the Stock record so
 *  the UI can display them. Fire-and-forget safe: errors are surfaced on next page load. */
export async function runExtractions(ticker: string, apiKey: string): Promise<void> {
  const results = await Promise.allSettled([
    extractRelationships(ticker, apiKey),
    extractContrarianAngles(ticker, apiKey),
  ]);

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason?.message || String(r.reason));

  if (errors.length > 0) {
    await prisma.stock.update({
      where: { ticker },
      data: { extractionError: errors.join("; ") },
    });
  } else {
    // Clear any previous error on success
    await prisma.stock.update({
      where: { ticker },
      data: { extractionError: null },
    });
  }
}

export async function extractRelationships(ticker: string, apiKey: string): Promise<void> {
  const context = await buildContextForStock(ticker);
  if (!context) return;

  const prompt = buildRelationshipPrompt(ticker, context);

  const result = await chatJson<{
    relationships: RelationshipExtract[];
  }>([{ role: "user", content: prompt }], apiKey, { temperature: 0.2 });

  if (!result.relationships || result.relationships.length === 0) return;

  const stock = await prisma.stock.findUnique({ where: { ticker } });
  if (!stock) return;

  // Replace only map-section relationships
  await prisma.relationship.deleteMany({
    where: { stockId: stock.id, section: "known" },
  });

  await prisma.relationship.createMany({
    data: result.relationships.map((r) => ({
      stockId: stock.id,
      type: (r.type || "other").toLowerCase().trim().slice(0, 50),
      target: (r.target || "Unknown").trim().slice(0, 200),
      description: r.description?.trim()?.slice(0, 500) || null,
      sources: r.sources?.trim()?.slice(0, 500) || null,
      confidence: ["confirmed", "speculative", "gap"].includes(r.sourceConfidence)
        ? r.sourceConfidence
        : "speculative",
      section: "known",
    })),
  });
}

export async function extractContrarianAngles(ticker: string, apiKey: string): Promise<void> {
  const context = await buildContextForStock(ticker);
  if (!context) return;

  const prompt = buildContrarianPrompt(ticker, context);

  const result = await chatJson<{
    angles: RelationshipExtract[];
  }>([{ role: "user", content: prompt }], apiKey, { temperature: 0.4 });

  if (!result.angles || result.angles.length === 0) return;

  const stock = await prisma.stock.findUnique({ where: { ticker } });
  if (!stock) return;

  // Replace only contrarian-section relationships
  await prisma.relationship.deleteMany({
    where: { stockId: stock.id, section: "contrarian" },
  });

  await prisma.relationship.createMany({
    data: result.angles.map((a) => ({
      stockId: stock.id,
      type: (a.type || "other").toLowerCase().trim().slice(0, 50),
      target: (a.target || "Unknown").trim().slice(0, 200),
      description: a.description?.trim()?.slice(0, 500) || null,
      sources: a.sources?.trim()?.slice(0, 500) || null,
      confidence: ["confirmed", "speculative", "gap"].includes(a.sourceConfidence)
        ? a.sourceConfidence
        : "speculative",
      section: "contrarian",
    })),
  });
}
