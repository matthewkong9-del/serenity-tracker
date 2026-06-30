"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { parseStance, STANCE_COLORS } from "@/lib/db";

interface BottomLineProps {
  summary: string | null;
  lastSummaryAt: string | null;
  needsSummary: boolean;
  summarizing: boolean;
  summaryError: string;
  onSummarize: () => void;
}

export function BottomLine({
  summary,
  lastSummaryAt,
  needsSummary,
  summarizing,
  summaryError,
  onSummarize,
}: BottomLineProps) {
  const [expanded, setExpanded] = useState(false);
  const stance = parseStance(summary);

  // Extract confidence from summary (e.g. "**Confidence:** 4/5")
  const confidenceMatch = summary?.match(/\*\*(?:Current )?Confidence:\*\*?\s*(\d\/\d)/i);
  const confidence = confidenceMatch ? confidenceMatch[1] : null;

  // Extract "## Bottom Line" section
  const bottomMatch = summary?.match(/## Bottom Line\s*\n+([\s\S]*?)(?=\n##|\n#|$)/);
  const bottomLine = bottomMatch ? bottomMatch[1].trim() : null;

  // Extract first paragraph as thesis preview (for collapsed state)
  const thesisParts = summary?.split(/\n(?=##|\*\*)/);
  const thesis =
    thesisParts && thesisParts.length > 0
      ? thesisParts[0]
          .replace(/^# \$[A-Z]+.*?\n+/, "")
          .trim()
          .slice(0, 200)
      : null;

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      {/* Header row: stance + confidence + action */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xs text-muted uppercase tracking-wider font-semibold">🧠 Thesis</h2>
          {summary && stance && (
            <span className={`text-xs border rounded-full px-3 py-1 ${STANCE_COLORS[stance]}`}>
              {stance}
            </span>
          )}
          {confidence && <span className="text-xs text-muted">{confidence} confidence</span>}
        </div>

        <div className="flex items-center gap-2">
          {lastSummaryAt && (
            <span className="text-muted/50 text-xs">
              {new Date(lastSummaryAt).toLocaleDateString()}
            </span>
          )}
          <button
            onClick={onSummarize}
            disabled={summarizing || !needsSummary}
            className={`text-xs px-3 py-1 rounded-lg font-medium transition ${
              needsSummary
                ? "bg-accent text-bg hover:bg-accent/90"
                : "bg-bg text-muted border border-border cursor-not-allowed"
            }`}
          >
            {summarizing ? "Analyzing..." : needsSummary ? "Run Summary" : "Up to date ✓"}
          </button>
        </div>
      </div>

      {summaryError && <p className="text-red-400 text-xs mb-3">{summaryError}</p>}

      {!summary ? (
        <p className="text-muted text-sm">
          {needsSummary
            ? "New data available. Run a summary to generate the thesis."
            : "Add notes or files to generate an AI thesis."}
        </p>
      ) : (
        <>
          {/* Collapsed: show thesis preview + bottom line */}
          {!expanded && (
            <div>
              {thesis && <p className="text-fg/70 text-sm leading-relaxed mb-3">{thesis}</p>}
              {bottomLine && (
                <p className="text-fg/80 text-sm leading-relaxed border-l-2 border-accent pl-3">
                  {bottomLine}
                </p>
              )}
            </div>
          )}

          {/* Expanded: full markdown */}
          <div
            className={`overflow-hidden transition-all duration-300 ${
              expanded ? "max-h-[4000px]" : "max-h-0"
            }`}
          >
            <div className="border-t border-border pt-4 prose prose-invert prose-sm max-w-none text-fg/80 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:text-fg [&_li]:mb-1">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-accent text-xs hover:underline mt-3 inline-block"
          >
            {expanded ? "Collapse ↑" : "Read full analysis ↓"}
          </button>
        </>
      )}
    </div>
  );
}
