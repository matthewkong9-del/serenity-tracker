import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

async function run(_input?: AgentInput): Promise<AgentResult> {
  try {
    // Fire-and-forget — price refresh takes 5-10 min
    fetch(`${BASE_URL}/api/prices/refresh`, { method: "POST" }).catch(() => {});
    return {
      ok: true,
      message: "Price refresh started (runs in background, ~5-10 min)",
    };
  } catch (e: any) {
    return { ok: false, message: `Price refresh failed: ${e.message}` };
  }
}

const agent: Agent = {
  key: "price",
  name: "Price",
  emoji: "💹",
  description: "Refreshes prices and fundamentals daily at 2 AM",
  stages: ["price_refresh"],
  run,
};

registerAgent(agent);
