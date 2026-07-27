import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/deepseek";
import { runExtractions } from "@/lib/relationships";
import { researchNewClaims } from "@/lib/research";
import { logPipelineRun } from "@/lib/pipeline-log";
import { notifyNewTweet } from "@/lib/telegram";
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
  claims: { ticker: string; text: string; confidence: number; impactScore: number; insightType: string }[];
  concepts: { name: string; description?: string; category?: string }[];
  insights: { name: string; description: string; category: string }[];
}> {
  const prompt = `You are an investment research assistant. Analyze this tweet/thread from a smart investor named "Serenity" (@aleaboreddit).

Serenity's methodology: find chokepoints in the supply chain, companies with pricing power, asymmetric setups, and structural advantages the market hasn't priced in.

Your job: extract structured data for a due diligence system.

1. **Tickers**: Identify EVERY stock ticker or company mentioned, including:
   - $TICKER format ($AAPL, $NVDA)
   - Korean/Japanese tickers (093370, 2316 TW)
   - Company names without $ ("Foosung", "Wistron", "Delta Electronics")
   For each: symbol (normalized, no $), name if mentioned, sector if inferrable.

2. **Claims**: Extract specific, FALSIFIABLE claims. Skip opinions, jokes, price predictions without rationale, and vague statements.

   For each claim also provide:
   - **confidence** (1-5): How sure are you that this claim is accurately extracted?
     5 = near-exact quote, 1 = very uncertain reading
   - **impactScore** (1-5): How important is this claim for an investment decision?
     5 = reveals a chokepoint (sole supplier, supply bottleneck, regulatory gate), pricing power shift, or major competitive moat
     4 = specific supply chain position, customer/supplier concentration, capacity signal
     3 = meaningful financial data, market share, or growth signal
     2 = general industry observation, moderately useful
     1 = vague directionality, low information value
   - **insightType**: Label what kind of insight this claim represents:
     "chokepoint" = sole supplier, supply bottleneck, regulatory gate, limited substitutes
     "dependency" = customer concentration, supplier concentration, single-point-of-failure
     "pricing_power" = ability to raise prices, margin expansion, cost pass-through
     "moat_signal" = IP, technology lead, scale advantage, network effects, switching costs
     "risk_factor" = dilution, regulatory risk, counterparty risk, macro exposure
     "general" = none of the above

3. **Concepts** (descriptive tags): Key technologies, supply chain dynamics, investment themes. Short labels. These describe WHAT the tweet is about.

4. **Insights** (structural findings): Specific observations about market structure, competitive dynamics, or supply chain architecture. These are NOT just tags — they capture a structural RELATIONSHIP or POSITION. Examples:
   - "LPKF is the sole qualified supplier of glass-substrate laser drilling equipment for advanced packaging"
   - "WUS Kunshan subsidiary alone is worth more than WUS's entire market cap"
   - "AMD and NVDA competing for the same limited CW laser supply, creating a bottleneck"
   - "Foosung is the only domestic Korean source of WF6, a critical gas for semiconductor manufacturing"

Return ONLY valid JSON, no markdown, no explanation:
{
  "tickers": [
    {"symbol": "LPKF", "name": "LPKF Laser & Electronics", "sector": "Semiconductor Equipment"}
  ],
  "claims": [
    {"ticker": "LPKF", "text": "80% of major global players selected LPKF equipment", "confidence": 5, "impactScore": 5, "insightType": "chokepoint"}
  ],
  "concepts": [
    {"name": "Glass Substrates", "description": "Next-gen substrate technology replacing silicon interposers", "category": "Technology"}
  ],
  "insights": [
    {"name": "LPKF is sole-source for glass substrate laser drilling", "description": "No other company has qualified laser drilling equipment for glass substrate advanced packaging, giving LPKF a temporary monopoly on a critical process step", "category": "Chokepoint"}
  ]
}

If nothing found, return empty arrays.

Tweet timestamp: ${timestamp || "unknown"}
Tweet content:
${content.slice(0, 8000)}`;

  return chatJson<{
    tickers: { symbol: string; name?: string; sector?: string }[];
    claims: { ticker: string; text: string; confidence: number; impactScore: number; insightType: string }[];
    concepts: { name: string; description?: string; category?: string }[];
    insights: { name: string; description: string; category: string }[];
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
  const telegramConfigured = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
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

    // Log ingest
    await logPipelineRun({
      stage: "ingest",
      status: "completed",
      tweetId: tweet.id,
      input: { timestamp: row.timestamp },
      decision: "Tweet saved and deduped.",
    });

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

    if (!investing) {
      await logPipelineRun({
        stage: "extract",
        status: "skipped",
        tweetId: tweet.id,
        decision: "Tweet classified as non-investing — skipped extraction.",
      });
      continue;
    }

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
            impactScore: c.impactScore || null,
            insightType: c.insightType || null,
            source: row.timestamp
              ? `Serenity tweet ${new Date(row.timestamp).toLocaleDateString()}`
              : "Serenity tweet",
          },
        });
        tweetClaims++;
        newlyAffectedTickers.add(symbol);
      }

      // Log extraction
      await logPipelineRun({
        stage: "extract",
        status: "completed",
        tweetId: tweet.id,
        input: { tweetContent: row.content.slice(0, 200) },
        output: {
          claimCount: tweetClaims,
          tickerCount: result.tickers.length,
          conceptCount: result.concepts?.length || 0,
        },
        decision: `Extracted ${tweetClaims} claims across ${result.tickers.length} ticker(s).`,
      });

      if (tweetClaims > 0) {
        await prisma.tweet.update({
          where: { id: tweet.id },
          data: { claimCount: tweetClaims },
        });
        totalClaims += tweetClaims;
      }

      // Save concepts (descriptive tags — type "tag")
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
              type: "tag",
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

      // Save insights (structural findings — type "insight")
      for (const ins of result.insights || []) {
        if (!ins.name || ins.name.length > 100) continue;

        const existing = await prisma.concept.findUnique({ where: { name: ins.name } });
        let concept;
        if (existing) {
          concept = existing;
          // If an existing tag is now also an insight, upgrade its type
          if (existing.type === "tag") {
            await prisma.concept.update({
              where: { id: existing.id },
              data: { type: "insight", description: ins.description?.slice(0, 500) || existing.description },
            });
          }
        } else {
          concept = await prisma.concept.create({
            data: {
              name: ins.name,
              description: ins.description?.slice(0, 500) || null,
              category: ins.category?.trim() || null,
              type: "insight",
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
      // ── Per-tweet Telegram notification ──
      if (telegramConfigured && tweetClaims > 0) {
        const tweetClaimRows = await prisma.claim.findMany({
          where: { tweetId: tweet.id },
          orderBy: { id: "asc" },
          select: { id: true, text: true, stock: { select: { ticker: true } }, impactScore: true, insightType: true },
        });

        const notificationClaims = tweetClaimRows.map((c) => ({
          claimId: c.id,
          ticker: c.stock.ticker,
          text: c.text,
          impactScore: c.impactScore,
          insightType: c.insightType,
        }));

        // Send notification first so we can capture the message_id
        const messageId = await notifyNewTweet(row.content, notificationClaims);

        // Store the mapping + message_id so the orchestrator can match
        // the user's reply to the correct triage entry
        await logPipelineRun({
          stage: "triage",
          status: "started",
          tweetId: tweet.id,
          output: {
            telegramMessageId: messageId,
            pendingClaims: notificationClaims.map((c, i) => ({
              index: i + 1,
              claimId: c.claimId,
              ticker: c.ticker,
            })),
          },
          decision: `Awaiting user orders for ${notificationClaims.length} new claims from tweet.`,
        });
      }
    } catch (e: any) {
      errors.push({ index: i + 1, error: e.message });
    }
  }

  // Re-extract relationships ONLY for stocks that received new claims this sync
  void runRelationshipExtractions(Array.from(newlyAffectedTickers), apiKey).catch((e) => {
    console.error("[sync] background relationship extraction failed:", e);
  });

  // Agent 2: Research new claims in the background.
  // SKIP if Telegram is configured — the user will give orders via Telegram.
  if (!telegramConfigured && newlyAffectedTickers.size > 0) {
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
