/**
 * Price agent — refreshes stock prices and fundamentals daily at 2 AM.
 *
 * Calls the price refresh endpoint. Reports actual success/failure
 * instead of silently swallowing errors.
 */

import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

async function run(_input?: AgentInput): Promise<AgentResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/prices/refresh`, {
      method: "POST",
      signal: AbortSignal.timeout(10 * 60 * 1000), // 10 min timeout
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, message: `Price refresh failed (${res.status}): ${body.slice(0, 200)}` };
    }

    const result = await res.json();
    return {
      ok: true,
      message: `Price refresh completed: ${result.updated || 0} updated`,
      ...result,
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
