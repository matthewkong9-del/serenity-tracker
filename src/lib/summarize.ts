import { prisma } from "@/lib/db";
import { chat } from "@/lib/deepseek";

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
