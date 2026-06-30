"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

interface BottomLineProps {
  summary: string | null;
}

export function BottomLine({ summary }: BottomLineProps) {
  const [expanded, setExpanded] = useState(false);

  if (!summary) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-xs text-muted uppercase tracking-wider font-semibold mb-3">
          📋 Bottom Line
        </h2>
        <p className="text-muted text-xs">Run a summary to see the bottom line.</p>
      </div>
    );
  }

  // Extract "## Bottom Line" section
  const bottomMatch = summary.match(/## Bottom Line\s*\n+([\s\S]*?)(?=\n##|\n#|$)/);
  const bottomLine = bottomMatch
    ? bottomMatch[1].trim()
    : summary.split("\n\n").pop()?.trim() || "";

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-xs text-muted uppercase tracking-wider font-semibold mb-3">
        📋 Bottom Line
      </h2>

      <p className="text-fg/80 text-sm leading-relaxed">{bottomLine}</p>

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-accent text-xs hover:underline mt-2 inline-block"
      >
        {expanded ? "Collapse ↑" : "Read full analysis ↓"}
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ${
          expanded ? "max-h-[4000px] mt-4" : "max-h-0"
        }`}
      >
        <div className="border-t border-border pt-4 prose prose-invert prose-sm max-w-none text-fg/80 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_strong]:text-fg [&_li]:mb-1">
          <ReactMarkdown>{summary}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
