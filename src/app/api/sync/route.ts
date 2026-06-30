import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/deepseek";
import { runExtractions } from "@/lib/relationships";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

function hashContent(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex").slice(0, 16);
}

async function extractClaimsFromTweet(
  content: string,
  timestamp: string | null,
  apiKey: string
): Promise<{
  tickers: { symbol: string; name?: string; sector?: string }[];
  claims: { ticker: string; text: string }[];
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
    {"ticker": "LPKF", "text": "80% of major global players selected LPKF equipment"}
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
    claims: { ticker: string; text: string }[];
    concepts: { name: string; description?: string; category?: string }[];
  }>([{ role: "user", content: prompt }], apiKey);
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
      content = lastQuote >= 0
        ? rest.slice(0, lastQuote).replace(/""/g, '"')
        : rest.replace(/""/g, '"');
    } else {
      // Unquoted content — take everything up to the next comma or end
      const nextComma = afterFirstComma.indexOf(",");
      content = nextComma >= 0
        ? afterFirstComma.slice(0, nextComma)
        : afterFirstComma;
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
            source: row.timestamp
              ? `Serenity tweet ${new Date(row.timestamp).toLocaleDateString()}`
              : "Serenity tweet",
          },
        });
        tweetClaims++;
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

  // Re-extract relationships for every stock affected by this sync
  const affectedTickers = new Set<string>();
  for (const row of dataRows) {
    const hash = hashContent(row.content);
    const existing = await prisma.tweet.findUnique({ where: { contentHash: hash } });
    if (existing) {
      const claimStocks = await prisma.claim.findMany({
        where: { tweetId: existing.id },
        select: { stock: { select: { ticker: true } } },
      });
      for (const c of claimStocks) affectedTickers.add(c.stock.ticker);
    }
  }
  for (const symbol of newStocks) affectedTickers.add(symbol);

  for (const ticker of Array.from(affectedTickers)) {
    try {
      await runExtractions(ticker, apiKey);
    } catch (e: any) {
      errors.push({ index: 0, error: `Relationship extraction failed for ${ticker}: ${e.message}` });
    }
  }

  return NextResponse.json({
    newTweets,
    skippedTweets,
    totalClaims,
    newStocks,
    errors,
  });
}
