import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

async function run(_input?: AgentInput): Promise<AgentResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/cleanup`, { method: "POST" });
    const result = await res.json();
    return { ok: res.ok, message: "Cleanup scan triggered", ...result };
  } catch (e: any) {
    return { ok: false, message: `Cleanup failed: ${e.message}` };
  }
}

const agent: Agent = {
  key: "cleanup",
  name: "Cleanup",
  emoji: "🧹",
  description: "Scans for duplicate claims and data quality issues weekly",
  stages: ["cleanup"],
  run,
};

registerAgent(agent);
