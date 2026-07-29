import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const syncUrl = process.env.SYNC_CSV_URL;
  if (!syncUrl) return { ok: false, message: "SYNC_CSV_URL not configured" };

  try {
    const res = await fetch(`${BASE_URL}/api/sync`, { method: "POST" });
    const result = await res.json();
    return { ok: res.ok, message: "Ingest (sync) triggered", ...result };
  } catch (e: any) {
    return { ok: false, message: `Ingest failed: ${e.message}` };
  }
}

const agent: Agent = {
  key: "ingest",
  name: "Ingest",
  emoji: "📥",
  description: "Fetches tweets, extracts tickers and claims hourly",
  stages: ["sync", "sync_ingest", "sync_extract"],
  run,
};

registerAgent(agent);
