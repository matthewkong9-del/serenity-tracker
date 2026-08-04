/**
 * Pure priority formula for research questions.
 * Computed at read time — no DB writes needed for routine bumps.
 */

function daysSince(date: Date, now: Date = new Date()): number {
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
}

export interface PriorityInput {
  priority: number;
  priorityLock: boolean;
  staleReason: string | null;
  status: string;
  answer: string | null;
  answeredAt: Date | string | null;
  updatedAt: Date | string;
}

/**
 * Compute the effective priority of a research question.
 * Manual-locked questions return their explicit priority unchanged.
 * Otherwise: stale flags surface immediately (+5), long-open
 * questions get gentle nudges at 30/60 day thresholds.
 */
export function effectivePriority(
  q: PriorityInput,
  now: Date = new Date()
): number {
  // User set manually — hands off
  if (q.priorityLock) return q.priority;

  let p = q.priority;

  // Contradiction flag → surface immediately
  if (q.staleReason) p += 5;

  // Age-based bumps for open questions
  if (q.status === "open") {
    const updatedAt =
      typeof q.updatedAt === "string" ? new Date(q.updatedAt) : q.updatedAt;
    const days = daysSince(updatedAt, now);
    if (days >= 60) p += 2;
    else if (days >= 30) p += 1;
  }

  // Long-answered questions slowly lose priority (but don't go negative)
  if (q.status === "answered" && q.answeredAt) {
    const answeredAt =
      typeof q.answeredAt === "string"
        ? new Date(q.answeredAt)
        : q.answeredAt;
    const days = daysSince(answeredAt, now);
    if (days >= 90) p -= 1;
  }

  return Math.max(0, p);
}

/**
 * Map effective priority to a display tier.
 */
export function priorityTier(
  p: number
): { label: string; color: string } {
  if (p >= 8) return { label: "P1", color: "text-red-400" };
  if (p >= 5) return { label: "P2", color: "text-amber-400" };
  if (p >= 2) return { label: "P3", color: "text-blue-400" };
  return { label: "P4", color: "text-muted" };
}
