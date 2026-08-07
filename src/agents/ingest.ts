/**
 * Ingest agent — fetches tweets, extracts claims, enqueues downstream work.
 *
 * Runs hourly via the scheduler. Calls sync logic through the API route
 * (the sync pipeline is complex enough to keep as a route), then enqueues
 * summarize tasks for stocks that received new claims.
 */

import { prisma } from "@/lib/db";
import { enqueueTask } from "@/lib/pending-tasks";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const syncUrl = process.env.SYNC_CSV_URL;
  if (!syncUrl) return { ok: false, message: "SYNC_CSV_URL not configured" };

  try {
    const res = await fetch(`${BASE_URL}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvUrl: syncUrl }),
    });
    const result = await res.json();

    if (!res.ok) {
      return { ok: false, message: `Ingest failed: ${result.error || res.statusText}` };
    }

    // Enqueue summarize for stocks that got new claims (the sync route already
    // enqueues research tasks for auto-eligible claims).
    if (result.totalClaims > 0 && result.newStocks?.length > 0) {
      for (const ticker of result.newStocks) {
        await enqueueTask({
          kind: "summarize",
          ticker,
          source: "scheduler",
        });
      }
    }

    return {
      ok: true,
      message: `Synced: ${result.newTweets} new tweets, ${result.totalClaims} claims, ${result.skippedTweets} skipped`,
      ...result,
    };
  } catch (e: any) {
    return { ok: false, message: `Ingest failed: ${e.message}` };
  }
}

const agent: Agent = {
  key: "ingest",
  name: "Ingest",
  emoji: "📥",
  description: "Fetches tweets, extracts tickers and claims hourly",
  // Stage names must match what the sync route actually logs (PipelineRun):
  // "ingest" = CSV fetch, "extract" = claim extraction, "triage" = Telegram prompts.
  stages: ["ingest", "extract", "triage"],
  run,
};

registerAgent(agent);
