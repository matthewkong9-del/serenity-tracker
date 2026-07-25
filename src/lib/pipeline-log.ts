import { prisma } from "@/lib/db";

// ── PipelineRun logger ────────────────────────────────────────────────────
// Every pipeline stage writes here so the triage page and orchestrator can
// see exactly what happened, when, and at what cost.

export type PipelineStage =
  | "ingest"     // tweet fetched from CSV, deduped, saved
  | "extract"    // claims + insights extracted from a tweet
  | "triage"     // impact scoring + confidence gating on a claim
  | "research"   // claim researched against web sources
  | "summarize"  // stock AI summary generated
  | "relationship" // relationship map extracted
  | "score";     // stock scored into opportunity bucket

export type RunStatus = "started" | "completed" | "failed" | "skipped";

export interface LogInput {
  stage: PipelineStage;
  status: RunStatus;
  stockTicker?: string | null;
  stockId?: number | null;
  claimId?: number | null;
  tweetId?: number | null;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  decision?: string | null;
  cost?: number | null;
  error?: string | null;
}

/**
 * Write one row to the PipelineRun audit log.
 * Never throws — logging failures must not break the pipeline.
 */
export async function logPipelineRun(params: LogInput): Promise<void> {
  try {
    await prisma.pipelineRun.create({
      data: {
        stage: params.stage,
        status: params.status,
        stockTicker: params.stockTicker ?? null,
        stockId: params.stockId ?? null,
        claimId: params.claimId ?? null,
        tweetId: params.tweetId ?? null,
        input: params.input ? JSON.stringify(params.input) : null,
        output: params.output ? JSON.stringify(params.output) : null,
        decision: params.decision ?? null,
        cost: params.cost ?? null,
        error: params.error ?? null,
        completedAt:
          params.status === "completed" || params.status === "failed"
            ? new Date()
            : null,
      },
    });
  } catch {
    // Logging is best-effort — never let it break the caller.
    console.error("[pipeline-log] failed to write PipelineRun row");
  }
}

/**
 * Update an existing PipelineRun row — e.g., mark it completed after the
 * work finishes. Returns silently if the row doesn't exist.
 */
export async function completePipelineRun(
  id: number,
  params: {
    status: "completed" | "failed" | "skipped";
    output?: Record<string, unknown> | null;
    decision?: string | null;
    cost?: number | null;
    error?: string | null;
  }
): Promise<void> {
  try {
    await prisma.pipelineRun.update({
      where: { id },
      data: {
        status: params.status,
        output: params.output ? JSON.stringify(params.output) : undefined,
        decision: params.decision ?? undefined,
        cost: params.cost ?? undefined,
        error: params.error ?? undefined,
        completedAt: new Date(),
      },
    });
  } catch {
    console.error("[pipeline-log] failed to update PipelineRun row");
  }
}
