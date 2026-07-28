import { prisma } from "@/lib/db";
import { chat, chatJson } from "@/lib/deepseek";
import { braveSearch } from "@/lib/brave";
import { logPipelineRun } from "@/lib/pipeline-log";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ── Types ──────────────────────────────────────────────────────────────────

export type ResearchDepth = "quick" | "deep";

interface Source {
  url: string;
  title: string;
  text: string;
}

interface ResearchVerdict {
  verdict: "supported" | "refuted" | "disputed" | "unresolved";
  confidence: "high" | "medium" | "low";
  summary: string;
  sources: { url: string; title: string; snippet: string }[];
  corroboratingSources: number;
}

// ── Search backends ────────────────────────────────────────────────────────

const MAX_SOURCES = 5;
const MAX_SOURCE_LEN = 3000;

/** Exa search — returns full page text directly, no scraping needed. */
async function exaSearch(query: string, apiKey: string): Promise<Source[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      numResults: 5,
      contents: { text: { maxCharacters: MAX_SOURCE_LEN }, highlights: { numSentences: 3 } },
    }),
    signal: AbortSignal.timeout(60_000), // 1 min — prevents stuck PipelineRuns when Exa hangs
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    url: r.url || "",
    title: r.title || "",
    text: r.text || "",
  }));
}

/** Scrape a single URL via markit-ai CLI. */
async function scrapeUrl(url: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`npx markit "${url}" -q`, {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const md = stdout?.trim();
    return md ? md.slice(0, MAX_SOURCE_LEN) : null;
  } catch {
    return null;
  }
}

/** Brave search + per-result scraping — fallback when Exa is unavailable. */
async function braveGatherSources(claimText: string, ticker: string): Promise<Source[]> {
  const query = `$${ticker} ${claimText}`.slice(0, 200);
  const results = await braveSearch(query, 3);
  const sources: Source[] = [];

  for (const r of results) {
    const text = await scrapeUrl(r.url);
    if (text) sources.push({ url: r.url, title: r.title, text });
  }

  return sources;
}

// ── Core research logic ────────────────────────────────────────────────────

/** Gather sources: try Exa first, fall back to Brave if Exa key is missing or errors out. */
async function gatherSources(
  claimText: string,
  ticker: string,
  deepseekKey: string
): Promise<{ sources: Source[]; backend: "exa" | "brave" }> {
  const exaKey = process.env.EXA_API_KEY;

  if (exaKey) {
    try {
      const sources = await exaSearch(`${ticker} ${claimText.slice(0, 200)}`, exaKey);
      if (sources.length > 0) return { sources, backend: "exa" };
    } catch (e: any) {
      console.warn(`[research] Exa search failed, falling back to Brave: ${e.message}`);
    }
  }

  // Brave fallback
  const sources = await braveGatherSources(claimText, ticker);
  return { sources, backend: "brave" };
}

/** Run a single research pass: search → DeepSeek verdict. Pure function — does not touch DB. */
async function researchPass(
  claimText: string,
  ticker: string,
  apiKey: string,
  angle: "confirm" | "refute"
): Promise<{ verdict: ResearchVerdict; sourceCount: number; backend: string }> {
  // Adjust the query slightly per angle so the two passes search differently
  const angledText =
    angle === "refute"
      ? `evidence against ${claimText}`
      : claimText;

  const { sources, backend } = await gatherSources(angledText, ticker, apiKey);

  if (sources.length === 0) {
    return {
      verdict: {
        verdict: "unresolved",
        confidence: "low",
        summary: "No relevant sources found on the web.",
        sources: [],
        corroboratingSources: 0,
      },
      sourceCount: 0,
      backend,
    };
  }

  // Build source context
  const sourceContext = sources
    .map((s, i) => `[Source ${i + 1}]\nTitle: ${s.title}\nURL: ${s.url}\nContent: ${s.text.slice(0, MAX_SOURCE_LEN)}`)
    .join("\n\n");

  const angleInstruction =
    angle === "refute"
      ? "You are looking for evidence that REFUTES or contradicts this claim. Be skeptical — if the evidence is weak, say so."
      : "You are looking for evidence that CONFIRMS or supports this claim. But be honest — if the evidence doesn't back it up, say so.";

  const prompt = `You are a rigorous fact-checking analyst. ${angleInstruction}

CLAIM: "${claimText}"
TICKER: $${ticker}

SOURCES:
${sourceContext}

Return ONLY valid JSON, no markdown:
{
  "verdict": "supported" | "refuted" | "disputed" | "unresolved",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentences explaining the verdict with specific data points from the sources.",
  "corroboratingSources": 0,
  "sources": [
    {"url": "https://...", "title": "Article title", "snippet": "The specific sentence or data point that supports your verdict"}
  ]
}

RULES:
- "supported" REQUIRES at least 2 independent sources that confirm the claim with specific evidence.
- "refuted" = sources directly contradict the claim.
- "disputed" = sources disagree with each other, evidence is mixed.
- "unresolved" = insufficient evidence either way.
- "high" confidence = 3+ independent credible sources agree, specific numbers cited.
- "medium" confidence = 2 independent credible sources agree.
- "low" confidence = single source, indirect evidence, thin data.
- Be honest about uncertainty. "Unresolved" is better than a wrong verdict.`;

  const verdict = await chatJson<ResearchVerdict>(
    [{ role: "user", content: prompt }],
    apiKey,
    { temperature: 0.1, purpose: "research_verdict" }
  );

  return { verdict, sourceCount: sources.length, backend };
}

/** Resolve two potentially-disagreeing verdicts into a single outcome. */
function resolveAdversarial(
  a: ResearchVerdict,
  b: ResearchVerdict
): { status: string; decision: string } {
  // Both agree on supported or refuted → apply
  if (a.verdict === b.verdict && (a.verdict === "supported" || a.verdict === "refuted")) {
    return {
      status: a.verdict,
      decision: `Both research passes agree: ${a.verdict}. Confidence: ${a.confidence}.`,
    };
  }

  // Both agree on unresolved → stay unverified
  if (a.verdict === "unresolved" && b.verdict === "unresolved") {
    return {
      status: "unverified",
      decision: "Both passes found insufficient evidence. Claim remains unverified.",
    };
  }

  // Disagree → disputed
  return {
    status: "disputed",
    decision: `Research passes disagree: pass A=${a.verdict}, pass B=${b.verdict}. Marked disputed for human review.`,
  };
}

/** Map ResearchVerdict to new claim status */
function verdictToStatus(v: ResearchVerdict): string {
  if (v.verdict === "supported") return "supported";
  if (v.verdict === "refuted") return "refuted";
  if (v.verdict === "disputed") return "disputed";
  return "unverified"; // unresolved → stay unverified
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Research a single claim against web sources.
 *
 * @param depth - "quick": single search + verdict. "deep": two independent
 *   passes (confirm + refute) with different search queries; verdicts that
 *   agree are auto-applied, disagreements are marked "disputed" for human review.
 */
export async function researchClaim(
  claimId: number,
  ticker: string,
  apiKey: string,
  depth: ResearchDepth = "quick"
): Promise<void> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { text: true, status: true, stockId: true },
  });
  if (!claim) return;
  if (claim.status !== "unverified") return;

  // Mark as researching
  await prisma.claim.update({
    where: { id: claimId },
    data: { researchStatus: "researching" },
  });

  await logPipelineRun({
    stage: "research",
    status: "started",
    stockTicker: ticker,
    stockId: claim.stockId,
    claimId,
    input: { claimText: claim.text, ticker, depth },
  });

  try {
    let newStatus: string;
    let evidenceText: string;
    let decision: string;

    if (depth === "deep") {
      // Adversarial 2-pass: independent confirm + refute searches
      const [passA, passB] = await Promise.all([
        researchPass(claim.text, ticker, apiKey, "confirm"),
        researchPass(claim.text, ticker, apiKey, "refute"),
      ]);

      const resolved = resolveAdversarial(passA.verdict, passB.verdict);
      newStatus = resolved.status;
      decision = resolved.decision;

      evidenceText = [
        `### Research Pass A (confirm) — ${passA.backend}`,
        `**Verdict:** ${passA.verdict.verdict} (${passA.verdict.confidence})`,
        passA.verdict.summary,
        passA.verdict.sources.map((s) => `- [${s.title}](${s.url}): ${s.snippet}`).join("\n"),
        "",
        `### Research Pass B (refute) — ${passB.backend}`,
        `**Verdict:** ${passB.verdict.verdict} (${passB.verdict.confidence})`,
        passB.verdict.summary,
        passB.verdict.sources.map((s) => `- [${s.title}](${s.url}): ${s.snippet}`).join("\n"),
        "",
        `**Resolution:** ${decision}`,
      ].join("\n");
    } else {
      // Quick: single pass
      const pass = await researchPass(claim.text, ticker, apiKey, "confirm");
      newStatus = verdictToStatus(pass.verdict);
      decision = `Research verdict: ${pass.verdict.verdict} (${pass.verdict.confidence}) via ${pass.backend}`;

      evidenceText = [
        `**Verdict:** ${pass.verdict.verdict} (${pass.verdict.confidence})`,
        pass.verdict.summary,
        pass.verdict.sources.map((s) => `- [${s.title}](${s.url}): ${s.snippet}`).join("\n"),
      ].join("\n\n");
    }

    // Persist
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        researchStatus: "done",
        researchedAt: new Date(),
        status: newStatus,
        evidence: evidenceText.trim(),
      },
    });

    await logPipelineRun({
      stage: "research",
      status: "completed",
      stockTicker: ticker,
      stockId: claim.stockId,
      claimId,
      output: { verdict: newStatus, depth },
      decision,
    });
  } catch (e: any) {
    await prisma.claim.update({
      where: { id: claimId },
      data: {
        researchStatus: "failed",
        evidence: `Research failed: ${e.message.slice(0, 500)}`,
      },
    });
    await logPipelineRun({
      stage: "research",
      status: "failed",
      stockTicker: ticker,
      stockId: claim.stockId,
      claimId,
      error: e.message?.slice(0, 500) || "Unknown error",
      decision: "Research failed — see error.",
    });
  }
}

/**
 * Research all new unverified claims for a given set of tickers.
 * Uses quick depth by default. Called as a background fire-and-forget from sync.
 */
export async function researchNewClaims(
  tickers: string[],
  apiKey: string,
  depth: ResearchDepth = "quick"
): Promise<{ researched: number; failed: number }> {
  const claims = await prisma.claim.findMany({
    where: {
      stock: { ticker: { in: tickers } },
      status: "unverified",
      researchStatus: "pending",
    },
    include: { stock: { select: { ticker: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let researched = 0;
  let failed = 0;

  const CONCURRENCY = 2;
  const queue = [...claims];

  async function worker() {
    while (queue.length > 0) {
      const claim = queue.shift();
      if (!claim) break;
      try {
        await researchClaim(claim.id, claim.stock.ticker, apiKey, depth);
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
