"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { timeAgo, parseStance, STANCE_COLORS } from "@/lib/db";

interface Props {
  synthesis: string | null;
  lastSynthesisAt: string | null;
  summary: string | null;
  lastSummaryAt: string | null;
  needsUpdate: boolean;
}

/**
 * Research Report — unified section at the top of the stock page.
 * Combines the Executive Brief (always visible) with the full
 * Analyst Report (expandable below). Feels like reading a research doc.
 *
 * Three reading tiers:
 *   Scan  — Executive Brief (30 seconds)
 *   Read  — Narrative Story (3 minutes, separate component)
 *   Study — Analyst Report (10 minutes, expandable below)
 */
export default function ResearchReport({
  synthesis,
  lastSynthesisAt,
  summary,
  lastSummaryAt,
  needsUpdate,
}: Props) {
  const [showAnalyst, setShowAnalyst] = useState(false);
  const stance = synthesis ? parseStance(synthesis) : summary ? parseStance(summary) : null;

  return (
    <div className="bg-surface border border-border rounded-xl border-l-2 border-l-accent/50 overflow-hidden mb-6">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">📄 Research Report</span>
          {stance && (
            <span
              className={`text-[10px] border rounded-full px-2 py-0.5 ${
                STANCE_COLORS[stance] || ""
              }`}
            >
              {stance}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {needsUpdate && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-amber-400"
              title="New data available — refresh recommended"
            />
          )}
          <span className="text-[10px] text-muted/50">
            {lastSynthesisAt
              ? `Updated ${timeAgo(lastSynthesisAt)}`
              : lastSummaryAt
                ? `Updated ${timeAgo(lastSummaryAt)}`
                : ""}
          </span>
        </div>
      </div>

      {/* ── Executive Brief ── */}
      {synthesis ? (
        <div className="px-5 py-4">
          <div
            className="prose prose-invert prose-sm max-w-none
              prose-headings:text-fg prose-headings:font-semibold
              prose-strong:text-fg prose-strong:font-semibold
              prose-p:text-fg/80 prose-p:leading-relaxed prose-p:mb-2
              prose-li:text-fg/70 prose-li:text-xs prose-li:leading-relaxed
              prose-code:text-accent prose-code:text-xs
              prose-a:text-accent prose-a:underline
            "
          >
            <ReactMarkdown>{synthesis}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4">
          <p className="text-xs text-muted">
            No executive brief yet. Run a summary refresh to generate one from all your research.
          </p>
        </div>
      )}

      {/* ── Analyst Report toggle ── */}
      {summary && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setShowAnalyst(!showAnalyst)}
            className="w-full flex items-center gap-2 px-5 py-2.5 text-xs text-muted hover:text-fg hover:bg-bg/50 transition"
          >
            <span className="text-base">{showAnalyst ? "📊" : "📊"}</span>
            <span>Analyst Report — full methodology &amp; evidence breakdown</span>
            <span className="text-[10px] text-muted/30 ml-auto">
              {showAnalyst ? "▾ Hide" : "▸ Expand"}
            </span>
          </button>

          {showAnalyst && (
            <div className="px-5 pb-5 border-t border-border/30">
              <div className="mt-4">
                <div
                  className="prose prose-invert prose-sm max-w-none
                    prose-headings:text-fg prose-headings:font-semibold
                    prose-h1:text-base prose-h2:text-sm
                    prose-strong:text-fg prose-strong:font-semibold
                    prose-p:text-fg/70 prose-p:text-xs prose-p:leading-relaxed
                    prose-li:text-fg/60 prose-li:text-xs prose-li:leading-relaxed
                    prose-code:text-accent prose-code:text-xs
                    prose-a:text-accent prose-a:underline
                  "
                >
                  <ReactMarkdown>{summary}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
