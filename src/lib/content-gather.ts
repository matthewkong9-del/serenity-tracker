/**
 * Content gathering for empty stocks.
 *
 * When a stock has zero tweets, files, or notes, it can never be summarized.
 * This module searches the web for company information and saves it as a
 * research note, making the stock "actionable" for the summarizer.
 *
 * Uses Exa (full-text search, no scraping needed) with Brave fallback.
 */

import { prisma } from "@/lib/db";
import { braveSearch } from "@/lib/brave";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ── Types ──────────────────────────────────────────────────────────────────

interface WebSource {
  url: string;
  title: string;
  text: string;
}

export interface GatherResult {
  ticker: string;
  name: string;
  sources: number;
  totalChars: number;
  saved: boolean;
  backend: "exa" | "brave" | "none";
  error?: string;
}

// ── Exa search ─────────────────────────────────────────────────────────────

const MAX_SOURCE_CHARS = 5000; // longer snippets for company overviews

async function exaSearch(query: string, apiKey: string): Promise<WebSource[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      numResults: 4,
      contents: { text: { maxCharacters: MAX_SOURCE_CHARS } },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    url: r.url || "",
    title: r.title || "",
    text: r.text || "",
  }));
}

// ── Brave + markit scraping (fallback) ──────────────────────────────────────

async function braveGatherSources(query: string): Promise<WebSource[]> {
  const results = await braveSearch(query, 3);
  const sources: WebSource[] = [];

  for (const r of results) {
    try {
      const { stdout } = await execAsync(`npx markit "${r.url}" -q`, {
        timeout: 30_000,
        maxBuffer: 5 * 1024 * 1024,
      });
      const text = stdout?.trim();
      if (text) {
        sources.push({
          url: r.url,
          title: r.title,
          text: text.slice(0, MAX_SOURCE_CHARS),
        });
      }
    } catch {
      // Skip URLs that fail to scrape
    }
  }

  return sources;
}

// ── Core gathering logic ───────────────────────────────────────────────────

/**
 * Gather web-sourced company information for a stock and save it as a
 * research note. After this, the stock has content and can be summarized.
 *
 * Runs two search angles for broader coverage:
 *   1. Company overview / what they do
 *   2. Supply chain / customers / competitors
 */
export async function gatherStockContent(
  ticker: string,
  name: string
): Promise<GatherResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const exaKey = process.env.EXA_API_KEY;

  // Build search queries — strip exchange suffixes for cleaner queries
  const cleanTicker = ticker.replace(/\..+$/, "");
  const queries = [
    `"${name}" (${cleanTicker}) company overview business products what does it do`,
    `"${name}" supply chain customers competitors industry position`,
  ];

  let allSources: WebSource[] = [];
  let backend: "exa" | "brave" | "none" = "none";

  // Try Exa first (full text, no scraping needed)
  if (exaKey) {
    try {
      const results = await Promise.all(
        queries.map((q) => exaSearch(q, exaKey))
      );
      allSources = results.flat();
      // Deduplicate by URL
      const seen = new Set<string>();
      allSources = allSources.filter((s) => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
      });
      backend = "exa";
    } catch (e: any) {
      console.warn(
        `[content-gather] Exa failed for ${ticker}, falling back to Brave: ${e.message}`
      );
    }
  }

  // Fall back to Brave + scraping
  if (allSources.length === 0) {
    try {
      const results = await Promise.all(
        queries.map((q) => braveGatherSources(q))
      );
      allSources = results.flat();
      const seen = new Set<string>();
      allSources = allSources.filter((s) => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
      });
      backend = allSources.length > 0 ? "brave" : "none";
    } catch (e: any) {
      console.warn(`[content-gather] Brave failed for ${ticker}: ${e.message}`);
    }
  }

  if (allSources.length === 0) {
    return {
      ticker,
      name,
      sources: 0,
      totalChars: 0,
      saved: false,
      backend: "none",
      error: "No sources found from any backend",
    };
  }

  // Compile into a structured markdown note
  const sections: string[] = [
    `# Auto-researched: ${name} (${ticker})`,
    "",
    `*Gathered from ${allSources.length} web sources via ${backend}. Review before relying on this data.*`,
    "",
  ];

  for (let i = 0; i < allSources.length; i++) {
    const s = allSources[i];
    sections.push(`## Source ${i + 1}: ${s.title}`);
    sections.push(`*${s.url}*`);
    sections.push("");
    sections.push(s.text);
    sections.push("");
  }

  const content = sections.join("\n");
  const totalChars = allSources.reduce((sum, s) => sum + s.text.length, 0);

  // Find the stock ID
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    select: { id: true },
  });
  if (!stock) {
    return {
      ticker,
      name,
      sources: allSources.length,
      totalChars,
      saved: false,
      backend,
      error: "Stock not found in DB",
    };
  }

  // Save as a research note
  await prisma.note.create({
    data: {
      stockId: stock.id,
      title: `Web Research: ${name}`,
      content,
      tag: "auto-research",
    },
  });

  // Touch the stock's updatedAt so needsSummary() / orchestrator picks it up
  await prisma.stock.update({
    where: { ticker },
    data: { updatedAt: new Date() },
  });

  console.log(
    `[content-gather] ${ticker}: saved ${allSources.length} sources, ${totalChars} chars via ${backend}`
  );

  return {
    ticker,
    name,
    sources: allSources.length,
    totalChars,
    saved: true,
    backend,
  };
}
