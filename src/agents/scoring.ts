import { prisma } from "@/lib/db";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const [withDepth, total] = await Promise.all([
    prisma.stock.count({ where: { chokepointDepth: { not: null } } }),
    prisma.stock.count(),
  ]);

  return {
    ok: true,
    message: `Scoring is computed live. ${withDepth}/${total} stocks have chokepoint depth.`,
  };
}

const agent: Agent = {
  key: "scoring",
  name: "Scoring",
  emoji: "🏷️",
  description: "Multi-factor stock scoring computed live on read",
  stages: ["scoring"],
  run,
};

registerAgent(agent);
