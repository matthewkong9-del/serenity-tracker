"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { timeAgo } from "@/lib/db";

interface Props {
  summary: string | null;
  lastSummaryAt: string | null;
}

/**
 * Analyst Report — the study tier of the stock page.
 * The full DeepSeek analysis: stance, supported/contradicted claims,
 * key numbers, gaps, bottom line. Long-form — expandable to keep the
 * page scannable.
 */
export default function AnalystReport({ summary, lastSummaryAt }: Props) {
  const [show, setShow] = useState(false);

  if (!summary) return null;

  return (
    <div className="bg-surface border border-border rounded-xl border-l-2 border-l-blue-400/40 overflow-hidden">
      {/* ── Header bar (clickable) ── */}
      <button
        onClick={() => setShow(!show)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-bg/50 transition"
      >
        <span className="text-base shrink-0">📊</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-fg">
            Analyst Report
          </span>
          <span className="block text-[10px] text-muted/50 mt-0.5">
            Full methodology &amp; evidence breakdown — every claim checked
            against its sources. The deep study.
          </span>
        </span>
        <span className="text-[10px] text-muted/50 shrink-0">
          {lastSummaryAt ? `Updated ${timeAgo(lastSummaryAt)}` : ""}
        </span>
        <span className="text-[10px] text-muted/30 shrink-0">
          {show ? "▾ Hide" : "▸ Expand"}
        </span>
      </button>

      {/* ── Report body ── */}
      {show && (
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
  );
}
