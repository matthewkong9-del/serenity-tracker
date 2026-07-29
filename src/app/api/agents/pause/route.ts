import {
  pauseScheduler,
  resumeScheduler,
  isSchedulerRunning,
} from "@/lib/scheduler";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/agents/pause
 *
 * Pauses or resumes the in-process scheduler.
 * No more pm2 shell commands — just sets an in-memory flag.
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

  if (action === "pause") {
    pauseScheduler();
    return NextResponse.json({
      ok: true,
      status: "paused",
      message: "Scheduler paused",
    });
  } else {
    resumeScheduler();
    return NextResponse.json({
      ok: true,
      status: "running",
      message: "Scheduler resumed",
    });
  }
}
