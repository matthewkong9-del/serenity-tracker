import { prisma } from "@/lib/db";
import { chat } from "@/lib/deepseek";
import { braveSearch } from "@/lib/brave";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Agent 2 — Claim Research Pipeline
// Brave Search → markit-ai scrape → DeepSeek verdict → DB update
// ---------------------------------------------------------------------------

const MAX_SOURCES = 3;
const MAX_SOURCE_LEN = 3000; // chars per source fed to DeepSeek

/** Summarize a URL's content into clean markdown via markit-ai. */
async function scrapeUrl(url: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`npx markit "${url}" -q`, {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const md = stdout?.trim();
    return md ? md.slice(0, MAX_SOURCE_LEN) : null;
  } catch {
    return null; // individual scrape failures are non-fatal
  }
}

/** Collect top-N sources for a claim by searching the web. */
async function gatherSources(claimText: string, ticker: string): Promise<string[]> {
  const query = `$${ticker} ${claimText}`.slice(0, 200);
  const results = await braveSearch(query, MAX_SOURCES);
  const sources: string[] = [];

  for (const r of results) {
    const md = await scrapeUrl(r.url);
    if (md) sources.push(`[Source: ${r.title}](${r.url})\n${md}`);
  }

  return sources;
}

const RESEARCH_PROMPT = `You are a research assistant helping an investor fact-check claims. Write in simple, clear English — like you're explaining to a friend. No jargon.

CLAIM TO CHECK:
{claim}

WHAT THE WEB SAYS:
{sources}

YOUR JOB:
1. Read the claim and all the sources.
2. Decide: does the evidence back up the claim, prove it wrong, or is it unclear?
3. Write a short paragraph (4-6 sentences) with this structure:

**What we found:** [one sentence — does the data support the claim or not?]
**The numbers:** [specific figures from sources — revenue, market share, dates, etc.]
**How reliable is this?** [one sentence — are the sources trustworthy? fresh data? anything missing?]
**Bottom line:** [one sentence summary]

Rules:
- If the sources disagree with each other, say so.
- If the data is old or from a sketchy source, flag it.
- If you can't find good evidence either way, just say that honestly.
- Use the source links provided — cite them inline like this: [source name](url).`;

// ... (keep the rest of the code the same, just changing the prompt)

/**
 * Research a single claim: search web, scrape sources, ask DeepSeek for verdict.
 * Updates Claim.researchStatus, Claim.status, and Claim.evidence in the DB.
 * Throws on fatal errors so the caller can mark the claim as "failed".
 */
export async function researchClaim(
  claimId: number,
  ticker: string,
  apiKey: string
): Promise<void> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { text: true, status: true },
  });
  if (!claim) return;
  if (claim.status !== "unverified") return; // only research unverified claims

  // Mark as researching
  await prisma.claim.update({
    where: { id: claimId },
    data: { researchStatus: "researching" },
  });

  try {
    // 1. Search + scrape
    const sources = await gatherSources(claim.text, ticker);

    if (sources.length === 0) {
      await prisma.claim.update({
        where: { id: claimId },
        data: {
          researchStatus: "done",
          researchedAt: new Date(),
          evidence:
            "**Verdict:** Unclear\n\nNo web sources were found to verify or refute this claim. Manual research may be needed.",
        },
      });
      return;
    }

    // 2. DeepSeek verdict
    const prompt = RESEARCH_PROMPT.replace("{claim}", claim.text).replace(
      "{sources}",
      sources.map((s, i) => `--- Source ${i + 1} ---\n${s}`).join("\n\n")
    );

    const verdictText = await chat([{ role: "user", content: prompt }], apiKey, {
      temperature: 0.2,
      purpose: "research_verdict",
    });

    // 3. Determine status from verdict
    const lowered = verdictText.toLowerCase();
    let newStatus: string = "unverified";
    // Match against the new plain-language format
    if (
      lowered.includes("the data supports") ||
      lowered.includes("evidence supports") ||
      lowered.includes("sources support") ||
      lowered.includes("does support the claim") ||
      lowered.includes("backs up the claim")
    ) {
      newStatus = "supported";
    } else if (
      lowered.includes("does not support") ||
      lowered.includes("prove it wrong") ||
      lowered.includes("proves it wrong") ||
      lowered.includes("data refutes") ||
      lowered.includes("evidence refutes") ||
      lowered.includes("is wrong") ||
      lowered.includes("not supported") ||
      lowered.includes("doesn't support")
    ) {
      newStatus = "refuted";
    }

    // 4. Persist
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        researchStatus: "done",
        researchedAt: new Date(),
        status: newStatus,
        evidence: verdictText.trim(),
      },
    });
  } catch (e: any) {
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        researchStatus: "failed",
        evidence: `Research failed: ${e.message.slice(0, 500)}`,
      },
    });
  }
}

/**
 * Research all new unverified claims for a given set of tickers.
 * Called as a background fire-and-forget from the sync route.
 * Bounded concurrency to avoid hammering APIs.
 */
export async function researchNewClaims(
  tickers: string[],
  apiKey: string
): Promise<{ researched: number; failed: number }> {
  const claims = await prisma.claim.findMany({
    where: {
      stock: { ticker: { in: tickers } },
      status: "unverified",
      researchStatus: "pending",
    },
    include: { stock: { select: { ticker: true } } },
    orderBy: { createdAt: "desc" },
    take: 50, // safety cap per batch
  });

  let researched = 0;
  let failed = 0;

  const CONCURRENCY = 2; // Brave rate limit: 1/sec. 2 is safe with per-claim latency.
  const queue = [...claims];

  async function worker() {
    while (queue.length > 0) {
      const claim = queue.shift();
      if (!claim) break;
      try {
        await researchClaim(claim.id, claim.stock.ticker, apiKey);
        researched++;
      } catch {
        failed++;
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, claims.length) }, () => worker());
  await Promise.all(workers);

  console.log(
    `[research] done: ${researched} researched, ${failed} failed out of ${claims.length} claims`
  );
  return { researched, failed };
}
