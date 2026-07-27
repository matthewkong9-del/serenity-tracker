import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

/**
 * POST /api/agents/pause
 *
 * Pauses or resumes the PM2 orchestrator process.
 * Body: { action: "pause" | "resume" }
 */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: string };

  if (!action || !["pause", "resume"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'pause' or 'resume'" },
      { status: 400 }
    );
  }

  try {
    if (action === "pause") {
      execSync("pm2 stop serenity-orchestrator", { timeout: 5000 });
      return NextResponse.json({ ok: true, status: "paused", message: "Orchestrator paused" });
    } else {
      execSync("pm2 start serenity-orchestrator", { timeout: 5000 });
      return NextResponse.json({ ok: true, status: "running", message: "Orchestrator resumed" });
    }
  } catch (e: any) {
    // If the process doesn't exist, that's fine for stop
    const msg = e.stderr?.toString() || e.message || "";
    if (msg.includes("not found") || msg.includes("doesn't exist")) {
      return NextResponse.json({
        ok: true,
        status: action === "pause" ? "paused" : "not_found",
        message:
          action === "pause"
            ? "Orchestrator was already stopped"
            : "Orchestrator process not found. Start it with: pm2 start scripts/orchestrator.js --name serenity-orchestrator",
      });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
