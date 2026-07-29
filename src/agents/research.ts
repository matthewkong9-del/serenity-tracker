import { prisma } from "@/lib/db";
import { researchNewClaims } from "@/lib/research";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, message: "DEEPSEEK_API_KEY not configured" };

  const pendingClaims = await prisma.claim.findMany({
    where: {
      status: "unverified",
      researchStatus: { in: ["pending", "failed"] },
    },
    include: { stock: { select: { ticker: true } } },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  if (pendingClaims.length === 0) {
    return { ok: true, message: "No pending claims to research" };
  }

  const tickers = Array.from(new Set(pendingClaims.map((c) => c.stock.ticker)));
  let researched = 0;
  let failed = 0;
  for (const t of tickers) {
    try {
      const result = await researchNewClaims([t], apiKey, "quick");
      researched += result.researched;
      failed += result.failed;
    } catch (e: any) {
      failed++;
      console.error(`[research] ${t} failed: ${e.message}`);
    }
  }

  return {
    ok: true,
    message: `Researched ${researched} claims across ${tickers.length} stocks (${failed} failed)`,
  };
}

const agent: Agent = {
  key: "research",
  name: "Research",
  emoji: "🔬",
  description: "Verifies claims via web search + LLM",
  stages: ["research", "verify", "research-all"],
  run,
};

registerAgent(agent);
