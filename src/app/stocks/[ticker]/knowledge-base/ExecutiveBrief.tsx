"use client";

import ReactMarkdown from "react-markdown";
import { timeAgo, parseStance, STANCE_COLORS } from "@/lib/db";

interface Props {
  synthesis: string | null;
  lastSynthesisAt: string | null;
  needsUpdate: boolean;
}

/**
 * Executive Brief — the 30-second scan tier of the stock page.
 * A condensed synthesis of every source (claims, documents, Q&A,
 * reflections, relationships). Always visible at the top.
 * Generated fire-and-forget after each summary; answered research
 * questions are treated as high-reliability evidence.
 */
export default function ExecutiveBrief({
  synthesis,
  lastSynthesisAt,
  needsUpdate,
}: Props) {
  const stance = synthesis ? parseStance(synthesis) : null;

  return (
    <div className="bg-surface border border-border rounded-xl border-l-2 border-l-accent/50 overflow-hidden">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">📄 Executive Brief</span>
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
              : ""}
          </span>
        </div>
      </div>

      {/* ── Description ── */}
      <p className="px-5 pt-3 text-[10px] text-muted/50 leading-relaxed">
        The 30-second scan — stance, key numbers, and bottom line, condensed
        from every source (claims, documents, Q&amp;A, reflections).
      </p>

      {/* ── Brief body ── */}
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
    </div>
  );
}
