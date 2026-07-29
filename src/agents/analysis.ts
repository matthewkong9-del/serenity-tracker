import { prisma } from "@/lib/db";
import { summarizeStock, needsSummary } from "@/lib/summarize";
import { generateNarrative } from "@/lib/narrative";
import { runExtractions } from "@/lib/relationships";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(input?: AgentInput): Promise<AgentResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, message: "DEEPSEEK_API_KEY not configured" };

  const ticker = input?.ticker;

  if (ticker) {
    await summarizeStock(ticker, apiKey);
    void runExtractions(ticker, apiKey).catch(() => {});
    void generateNarrative(ticker, apiKey).catch(() => {});
    return { ok: true, message: `Analyzed $${ticker}`, ticker };
  }

  // Find the most stale stock
  const stocksToCheck = await prisma.stock.findMany({
    select: {
      ticker: true,
      lastSummaryAt: true,
      files: { select: { createdAt: true } },
      notes: { select: { createdAt: true } },
      claims: { select: { createdAt: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const stale = stocksToCheck.filter((s) => needsSummary(s));
  if (stale.length === 0) {
    return { ok: true, message: "All stocks up to date" };
  }

  const s = stale[0];
  await summarizeStock(s.ticker, apiKey);
  void runExtractions(s.ticker, apiKey).catch(() => {});
  void generateNarrative(s.ticker, apiKey).catch(() => {});
  return { ok: true, message: `Analyzed $${s.ticker}`, ticker: s.ticker };
}

const agent: Agent = {
  key: "analysis",
  name: "Analysis",
  emoji: "📊",
  description: "Summarizes stocks, writes narratives, maps relationships",
  stages: ["summarize", "narrative", "relationship"],
  run,
};

registerAgent(agent);
