import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/deepseek";
import { runExtractions } from "@/lib/relationships";
import { researchNewClaims } from "@/lib/research";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

function hashContent(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex").slice(0, 16);
}

/** Quick LLM classifier: is this tweet about investing/markets, or personal/off-topic?
 *  Costs ~$0.00002 per call — tiny prompt + yes/no response. */
async function isInvestingTweet(
  content: string,
  apiKey: string
): Promise<boolean> {
  const prompt = `Is the following tweet about investing, financial markets, stocks, or company/industry analysis? Answer ONLY "yes" or "no".

Tweet: ${content.slice(0, 2000)}`;

  const result = await chatJson<{ answer: string }>(
    [{ role: "user", content: prompt }],
    apiKey,
    { temperature: 0 }
  );
  return result.answer?.toLowerCase().trim() === "yes";
}

async function extractClaimsFromTweet(
  content: string,
  timestamp: string | null,
  apiKey: string
): Promise<{
  tickers: { symbol: string; name?: string; sector?: string }[];
  claims: { ticker: string; text: string; confidence: number }[];
  concepts: { name: string; description?: string; category?: string }[];
}> {
  const prompt = `You are an investment research assistant. Analyze this tweet/thread from a smart investor named "Serenity" (@aleaboreddit).

Your job: extract structured data for a due diligence system.

1. **Tickers**: Identify EVERY stock ticker or company mentioned, including:
   - $TICKER format (e.g., $AAPL, $NVDA)
   - Korean/Japanese tickers (e.g., 093370, 2316 TW)
   - Company names without $ (e.g., "Foosung", "Wistron", "Delta Electronics")
   For each, provide: symbol (normalized, no $), name if mentioned, sector if inferrable.

2. **Claims**: Extract specific, FALSIFIABLE claims. A claim must be something that can be verified or refuted with data. Skip:
   - Opinions ("this stock is great")
   - Jokes, memes, personal insults
   - Price predictions without rationale
   - Vague statements

   Include claims like:
   - "80% of major players selected LPKF equipment"
   - "AMD scrambling for CW laser supply"
   - "China eased InP substrate exports"
   - "NASDAQ listing actively on their radar"
   - "WUS owns 11.26% of WUS Kunshan worth $4.42B"

   For each claim, SELF-RATE your confidence that the claim is accurately extracted (1-5):
   - 5 = directly quoted or near-exact paraphrase from the tweet, clear ticker attribution
   - 4 = strong evidence in the tweet, minor ambiguity
   - 3 = reasonable inference but some ambiguity in wording or ticker
   - 2 = speculative reading, multiple interpretations possible
   - 1 = very uncertain — could easily be wrong

3. **Concepts**: Extract key technologies, supply chain relationships, investment themes, and other notable concepts. These are NOT stocks — they are the ideas, technologies, and dynamics that connect everything. Include:
   - Technologies ("Silicon Photonics", "HBM", "CW Laser", "InP Substrates", "Glass substrates")
   - Supply chain dynamics ("OSAT consolidation", "China export controls", "NVIDIA supply chain")
   - Investment themes ("optical interconnect", "AI capex cycle", "semiconductor equipment boom")
   - Notable private companies, products, or events
   For each concept, provide a short name and 1-sentence description from context. Categorize as: Technology, Supply Chain, Market Theme, Product, or Other.

Return ONLY valid JSON, no markdown, no explanation:
{
  "tickers": [
    {"symbol": "LPKF", "name": "LPKF Laser & Electronics", "sector": "Semiconductor Equipment"}
  ],
  "claims": [
    {"ticker": "LPKF", "text": "80% of major global players selected LPKF equipment", "confidence": 5}
  ],
  "concepts": [
    {"name": "Silicon Photonics", "description": "Photonic integrated circuit technology for optical interconnects", "category": "Technology"}
  ]
}

If no tickers, claims, or concepts found, return empty arrays.

Tweet timestamp: ${timestamp || "unknown"}
Tweet content:
${content.slice(0, 8000)}`;

  return chatJson<{
    tickers: { symbol: string; name?: string; sector?: string }[];
    claims: { ticker: string; text: string; confidence: number }[];
    concepts: { name: string; description?: string; category?: string }[];
  }>([{ role: "user", content: prompt }], apiKey, { purpose: "claim_extraction" });
}

/** Re-extract the relationship + contrarian map for each ticker with bounded
 *  concurrency. Errors are caught per-ticker (and surfaced via
 *  Stock.extractionError inside runExtractions), so this never rejects. */
async function runRelationshipExtractions(tickers: string[], apiKey: string): Promise<void> {
  const CONCURRENCY = 4;
  const queue = [...tickers];
  async function worker() {
    while (queue.length > 0) {
      const ticker = queue.shift();
      if (!ticker) break;
      try {
        await runExtractions(ticker, apiKey);
      } catch (e: any) {
        console.error(`[sync] relationship extraction failed for ${ticker}: ${e.message}`);
      }
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, tickers.length) }, () => worker());
  await Promise.all(workers);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const { csvUrl } = await req.json();
  if (!csvUrl) {
    return NextResponse.json({ error: "csvUrl is required" }, { status: 400 });
  }

  // Fetch CSV
  let csvText: string;
  try {
    const res = await fetch(csvUrl, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    csvText = await res.text();
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to fetch CSV: ${e.message}` }, { status: 400 });
  }

  // Parse CSV — split on timestamp pattern to find row boundaries.
  // Google Sheets outputs timestamps with variable-width hours (e.g. "1:43:47" not "01:43:47").
  const TS = /^(\d{4}-\d{2}-\d{2}\s\d{1,2}:\d{2}:\d{2}),/;
  const lines = csvText.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    if (TS.test(line) && current) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }
  if (current) chunks.push(current);

  const dataRows: { timestamp: string; content: string }[] = [];
  for (const chunk of chunks) {
    const tsMatch = chunk.match(TS);
    if (!tsMatch) continue;
    const timestamp = tsMatch[1];
    if (timestamp.toLowerCase() === "timestamp") continue; // skip header

    // Content is in the 3rd CSV column.
    // Quoted:   timestamp,Author,"multi,line\ncontent",URL,ID
    // Unquoted: timestamp,Author,simple content,URL,ID
    const afterTimestamp = chunk.slice(tsMatch[0].length); // "Author,..."
    const afterFirstComma = afterTimestamp.slice(afterTimestamp.indexOf(",") + 1); // "...content...",URL,ID

    let content: string;
    if (afterFirstComma.startsWith('"')) {
      // Quoted content — find matching close quote
      const rest = afterFirstComma.slice(1);
      const lastQuote = rest.lastIndexOf('"');
      content =
        lastQuote >= 0 ? rest.slice(0, lastQuote).replace(/""/g, '"') : rest.replace(/""/g, '"');
    } else {
      // Unquoted content — take everything up to the next comma or end
      const nextComma = afterFirstComma.indexOf(",");
      content = nextComma >= 0 ? afterFirstComma.slice(0, nextComma) : afterFirstComma;
    }

    if (content.trim()) {
      dataRows.push({ timestamp, content });
    }
  }

  // Process
  let newTweets = 0;
  let skippedTweets = 0;
  let totalClaims = 0;
  const newStocks: string[] = [];
  const errors: { index: number; error: string }[] = [];
  // Stocks that received NEW claims from NEW tweets this sync — only these need
  // their relationship map re-extracted.
  const newlyAffectedTickers = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const hash = hashContent(row.content);

    // Dedup
    const existing = await prisma.tweet.findUnique({ where: { contentHash: hash } });
    if (existing) {
      skippedTweets++;
      continue;
    }

    // Save tweet
    const tweet = await prisma.tweet.create({
      data: {
        contentHash: hash,
        content: row.content,
        timestamp: row.timestamp ? new Date(row.timestamp) : null,
      },
    });

    newTweets++;

    // Pre-filter: skip non-investing tweets before expensive claim extraction
    let investing = true;
    try {
      investing = await isInvestingTweet(row.content, apiKey);
      await prisma.tweet.update({
        where: { id: tweet.id },
        data: { isInvesting: investing },
      });
    } catch {
      // If classifier fails, err on the side of extracting (don't lose data)
      await prisma.tweet.update({
        where: { id: tweet.id },
        data: { isInvesting: null },
      });
    }

    if (!investing) continue;

    // Extract claims via LLM
    try {
      const result = await extractClaimsFromTweet(row.content, row.timestamp, apiKey);

      // Create/find stocks for each ticker
      for (const t of result.tickers) {
        const symbol = t.symbol.toUpperCase().trim();
        if (!symbol || symbol.length > 10) continue;

        const existingStock = await prisma.stock.findUnique({ where: { ticker: symbol } });
        if (!existingStock) {
          await prisma.stock.create({
            data: {
              ticker: symbol,
              name: t.name?.trim() || null,
              sector: t.sector?.trim() || null,
            },
          });
          newStocks.push(symbol);
        }
      }

      // Create claims
      let tweetClaims = 0;
      for (const c of result.claims) {
        const symbol = c.ticker.toUpperCase().trim();
        if (!symbol || symbol.length > 10) continue;

        const stock = await prisma.stock.findUnique({ where: { ticker: symbol } });
        if (!stock) continue;

        await prisma.claim.create({
          data: {
            stockId: stock.id,
            tweetId: tweet.id,
            text: c.text,
            extractionConfidence: c.confidence,
            source: row.timestamp
              ? `Serenity tweet ${new Date(row.timestamp).toLocaleDateString()}`
              : "Serenity tweet",
          },
        });
        tweetClaims++;
        newlyAffectedTickers.add(symbol);
      }

      if (tweetClaims > 0) {
        await prisma.tweet.update({
          where: { id: tweet.id },
          data: { claimCount: tweetClaims },
        });
        totalClaims += tweetClaims;
      }

      // Save concepts
      for (const c of result.concepts || []) {
        if (!c.name || c.name.length > 100) continue;

        const existing = await prisma.concept.findUnique({ where: { name: c.name } });
        let concept;
        if (existing) {
          concept = existing;
        } else {
          concept = await prisma.concept.create({
            data: {
              name: c.name,
              description: c.description?.slice(0, 500) || null,
              category: c.category?.trim() || null,
            },
          });
        }

        if (concept) {
          const existingLink = await prisma.tweetConcept.findUnique({
            where: { tweetId_conceptId: { tweetId: tweet.id, conceptId: concept.id } },
          });
          if (!existingLink) {
            await prisma.tweetConcept.create({
              data: { tweetId: tweet.id, conceptId: concept.id },
            });
          }
        }
      }
    } catch (e: any) {
      errors.push({ index: i + 1, error: e.message });
    }
  }

  // Re-extract relationships ONLY for stocks that received new claims this sync
  // (not every tweet already in the DB). This runs in the background so the sync
  // response returns immediately — tweets and claims are already persisted, and
  // the relationship mind map updates on the next stock-page load.
  void runRelationshipExtractions(Array.from(newlyAffectedTickers), apiKey).catch((e) => {
    console.error("[sync] background relationship extraction failed:", e);
  });

  // Agent 2: Research new claims in the background.
  // Only fires when there are actually new claims to research.
  if (newlyAffectedTickers.size > 0) {
    void researchNewClaims(Array.from(newlyAffectedTickers), apiKey).catch((e) => {
      console.error("[sync] background claim research failed:", e);
    });
  }

  return NextResponse.json({
    newTweets,
    skippedTweets,
    totalClaims,
    newStocks,
    errors,
  });
}
