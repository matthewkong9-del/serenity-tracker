import { orchestratorTick } from "@/lib/orchestrator";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/orchestrate
 *
 * Thin wrapper around orchestratorTick(). The in-process scheduler calls
 * orchestratorTick() directly — this route exists for backward compat
 * (manual triggers, agent dashboard "Run Now" button, legacy HTTP callers).
 *
 * Token auth is preserved so external callers can't trigger ticks without
 * the ORCHESTRATOR_TOKEN.
 */
export async function POST(req: NextRequest) {
  // Auth check — only the orchestrator (or dashboard with token) can call this
  const token = process.env.ORCHESTRATOR_TOKEN;
  if (token) {
    const sent = req.headers.get("x-orchestrator-token");
    if (sent !== token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await orchestratorTick();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error(`[orchestrate] route error: ${e.message}`);
    return NextResponse.json(
      { error: e.message || "Orchestration tick failed" },
      { status: 500 }
    );
  }
}
