import { getAgent } from "@/agents";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/agents/trigger
 *
 * Routes agent trigger requests to the correct agent module via the registry.
 * Each agent self-registers on import (see src/agents/*.ts).
 *
 * Body: { agent: "watchdog" | "research" | ... , ticker?: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { agent, ticker } = body as { agent?: string; ticker?: string };

  if (!agent) {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }

  const a = getAgent(agent);
  if (!a) {
    return NextResponse.json(
      {
        error: `Unknown agent: ${agent}. Valid: ingest, research, price, cleanup, watchdog, ops, auditor, editor, decision, orchestrator`,
      },
      { status: 400 }
    );
  }

  try {
    const result = await a.run({ ticker });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Agent trigger failed" },
      { status: 500 }
    );
  }
}
