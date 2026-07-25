"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/db";

interface PipelineRunEntry {
  id: number;
  stage: string;
  status: string;
  decision: string | null;
  startedAt: string;
}

interface Props {
  ticker: string;
}

const STAGE_LABELS: Record<string, string> = {
  extract: "Claims extracted",
  research: "Claim researched",
  summarize: "Summary updated",
  relationship: "Supply chain map updated",
  triage: "New claims awaiting review",
  ingest: "Tweet ingested",
};

const STAGE_COLORS: Record<string, string> = {
  completed: "text-green-400",
  failed: "text-red-400",
  started: "text-blue-400",
  skipped: "text-muted",
};

/**
 * Changelog — shows what happened to this stock recently.
 * Reads from PipelineRun for this stock's ticker.
 * New items (since last visit) get a subtle highlight.
 */
export default function Changelog({ ticker }: Props) {
  const [entries, setEntries] = useState<PipelineRunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVisit, setLastVisit] = useState<string | null>(null);

  useEffect(() => {
    // Track last visit time in localStorage
    const key = `kb-visit-${ticker}`;
    const prev = localStorage.getItem(key);
    setLastVisit(prev);
    localStorage.setItem(key, new Date().toISOString());
  }, [ticker]);

  useEffect(() => {
    fetch(`/api/stocks/${ticker}/activity?limit=15`)
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="h-4 bg-bg rounded w-32 mb-4 animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 bg-bg rounded w-full mb-2 animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-fg mb-2">What&apos;s New</h3>
        <p className="text-xs text-muted">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-fg mb-4">What&apos;s New</h3>
      <div className="space-y-3">
        {entries.map((entry, i) => {
          const isNew =
            lastVisit && new Date(entry.startedAt) > new Date(lastVisit);
          const stageLabel = STAGE_LABELS[entry.stage] || entry.stage;

          return (
            <div
              key={entry.id}
              className={`flex items-start gap-3 text-sm transition ${
                isNew
                  ? "bg-accent/5 -mx-2 px-2 py-1 rounded border-l-2 border-accent/30"
                  : ""
              }`}
            >
              {/* Dot indicator */}
              <span
                className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  entry.status === "completed"
                    ? "bg-green-400"
                    : entry.status === "failed"
                      ? "bg-red-400"
                      : "bg-blue-400"
                }`}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-fg/80 font-medium truncate">
                    {stageLabel}
                  </span>
                  {isNew && (
                    <span className="text-[10px] text-accent font-medium flex-shrink-0">
                      NEW
                    </span>
                  )}
                </div>
                {entry.decision && (
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">
                    {entry.decision}
                  </p>
                )}
                <span
                  className={`text-[10px] ${STAGE_COLORS[entry.status] || "text-muted"}`}
                >
                  {entry.status} · {timeAgo(entry.startedAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
