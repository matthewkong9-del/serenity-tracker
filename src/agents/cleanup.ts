/**
 * Cleanup agent — scans for and merges duplicate claims weekly (Sunday 4 AM).
 *
 * Calls the cleanup endpoint which runs DeepSeek to identify near-duplicate
 * claims and merges approved ones.
 */

import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

async function run(_input?: AgentInput): Promise<AgentResult> {
  try {
    // Step 1: Scan for duplicates
    const scanRes = await fetch(`${BASE_URL}/api/cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scan" }),
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });

    if (!scanRes.ok) {
      const body = await scanRes.text();
      return { ok: false, message: `Cleanup scan failed (${scanRes.status}): ${body.slice(0, 200)}` };
    }

    const scanResult = await scanRes.json();

    // Step 2: Execute approved merges (if any pending tasks were auto-approved)
    const execRes = await fetch(`${BASE_URL}/api/cleanup`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "execute" }),
      signal: AbortSignal.timeout(60_000),
    });

    const execResult = execRes.ok ? await execRes.json() : { merged: 0 };

    return {
      ok: true,
      message: `Cleanup: scanned ${scanResult.scanned} stocks, ${scanResult.duplicateGroups} duplicate groups, merged ${execResult.merged}`,
      ...scanResult,
      merged: execResult.merged,
    };
  } catch (e: any) {
    return { ok: false, message: `Cleanup failed: ${e.message}` };
  }
}

const agent: Agent = {
  key: "cleanup",
  name: "Cleanup",
  emoji: "🧹",
  description: "Scans for duplicate claims and merges them weekly",
  stages: ["cleanup"],
  run,
};

registerAgent(agent);
