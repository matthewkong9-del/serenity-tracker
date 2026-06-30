"use client";

import { parseStance, STANCE_COLORS } from "@/lib/db";

interface StanceCardProps {
  summary: string | null;
  lastSummaryAt: string | null;
  needsSummary: boolean;
  summarizing: boolean;
  summaryError: string;
  onSummarize: () => void;
}

export function StanceCard({
  summary,
  lastSummaryAt,
  needsSummary,
  summarizing,
  summaryError,
  onSummarize,
}: StanceCardProps) {
  const stance = parseStance(summary);

  // Extract confidence from summary (e.g. "**Confidence:** 4/5")
  const confidenceMatch = summary?.match(/\*\*(?:Current )?Confidence:\*\*?\s*(\d\/\d)/i);
  const confidence = confidenceMatch ? confidenceMatch[1] : null;

  // Extract first meaningful paragraph as thesis (after heading line, before any "##" or "**")
  const thesisParts = summary?.split(/\n(?=##|\*\*)/);
  const thesis = thesisParts && thesisParts.length > 0
    ? thesisParts[0].replace(/^# \$[A-Z]+.*?\n+/, "").trim().slice(0, 200)
    : null;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 h-full flex flex-col">
      <h2 className="text-xs text-muted uppercase tracking-wider font-semibold mb-4">
        🧠 AI Thesis
      </h2>

      {summaryError && (
        <p className="text-red-400 text-xs mb-3">{summaryError}</p>
      )}

      {summary ? (
        <>
          <div className="flex items-center gap-3 mb-3">
            {stance && (
              <span
                className={`text-xs border rounded-full px-3 py-1 ${STANCE_COLORS[stance]}`}
              >
                {stance}
              </span>
            )}
            {confidence && (
              <span className="text-xs text-muted">
                {confidence} confidence
              </span>
            )}
          </div>

          {thesis && (
            <p className="text-fg/70 text-sm leading-relaxed line-clamp-2 mb-4">
              {thesis}
            </p>
          )}

          {lastSummaryAt && (
            <p className="text-muted/50 text-xs mt-auto pt-3 border-t border-border">
              Last summarized: {new Date(lastSummaryAt).toLocaleString()}
            </p>
          )}
        </>
      ) : (
        <p className="text-muted text-sm mb-4">
          {needsSummary
            ? "New data available. Run a summary to generate the thesis."
            : "Add notes or files to generate an AI thesis."}
        </p>
      )}

      <div className={summary ? "mt-3" : ""}>
        <button
          onClick={onSummarize}
          disabled={summarizing || !needsSummary}
          className={`text-sm px-4 py-1.5 rounded-lg font-medium transition w-full ${
            needsSummary
              ? "bg-accent text-bg hover:bg-accent/90"
              : "bg-bg text-muted border border-border cursor-not-allowed"
          }`}
        >
          {summarizing
            ? "Analyzing..."
            : needsSummary
            ? "Run Summary"
            : "Up to date ✓"}
        </button>
      </div>
    </div>
  );
}
