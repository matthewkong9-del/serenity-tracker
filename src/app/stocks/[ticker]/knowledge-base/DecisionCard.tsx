"use client";

/**
 * Decision card — displays the AI-generated investment thesis for a stock.
 *
 * Shows the buy/hold/sell recommendation with confidence level, the 1-paragraph
 * thesis, key risks, catalysts, and time horizon. Only renders when a decision
 * with a deep thesis exists in the DB.
 */

import ReactMarkdown from "react-markdown";

interface DecisionData {
  maturity: string;
  action: string | null;
  reasoning: string | null;
}

interface ParsedThesis {
  thesis: string;
  confidence: string;
  risks: string[];
  catalysts: string[];
  timeHorizon: string;
}

function parseReasoning(reasoning: string | null): ParsedThesis | null {
  if (!reasoning) return null;
  try {
    const parsed = JSON.parse(reasoning);
    if (parsed.thesis) return parsed as ParsedThesis;
  } catch {
    // Old-format reasoning (plain text from generateDecisions) — skip
  }
  return null;
}

const ACTION_STYLES: Record<string, string> = {
  buy: "text-green-400 border-green-400/30 bg-green-400/10",
  hold: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  sell: "text-red-400 border-red-400/30 bg-red-400/10",
};

const ACTION_LABELS: Record<string, string> = {
  buy: "🟢 BUY",
  hold: "🟡 HOLD",
  sell: "🔴 SELL",
};

const CONFIDENCE_STARS: Record<string, string> = {
  high: "★★★",
  medium: "★★☆",
  low: "★☆☆",
};

export default function DecisionCard({ decision }: { decision: DecisionData | null }) {
  const thesis = parseReasoning(decision?.reasoning ?? null);
  if (!thesis || !decision?.action) return null;

  const actionStyle = ACTION_STYLES[decision.action] || ACTION_STYLES.hold;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧠</span>
          <h3 className="text-xs font-semibold text-fg/80 uppercase tracking-wider">
            Investment Thesis
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">
            {CONFIDENCE_STARS[thesis.confidence] || ""} {thesis.confidence} confidence
          </span>
          <span
            className={`text-[10px] border rounded-full px-2 py-0.5 font-medium ${actionStyle}`}
          >
            {ACTION_LABELS[decision.action] || decision.action.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Thesis paragraph */}
      <div className="px-4 py-3">
        <p className="text-sm text-fg/85 leading-relaxed">{thesis.thesis}</p>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4">
        {/* Risks */}
        {thesis.risks.length > 0 && (
          <div>
            <h4 className="text-[10px] font-semibold text-red-400/80 uppercase tracking-wider mb-1.5">
              Key Risks
            </h4>
            <ul className="space-y-1">
              {thesis.risks.map((risk, i) => (
                <li key={i} className="text-[11px] text-muted flex gap-1.5">
                  <span className="text-red-400/60 shrink-0">▸</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Catalysts + horizon */}
        <div>
          {thesis.catalysts.length > 0 && (
            <>
              <h4 className="text-[10px] font-semibold text-green-400/80 uppercase tracking-wider mb-1.5">
                Catalysts
              </h4>
              <ul className="space-y-1 mb-2">
                {thesis.catalysts.map((cat, i) => (
                  <li key={i} className="text-[11px] text-muted flex gap-1.5">
                    <span className="text-green-400/60 shrink-0">▸</span>
                    <span>{cat}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {thesis.timeHorizon && (
            <div className="text-[10px] text-muted/60 mt-1">
              ⏱ Time horizon:{" "}
              <span className="text-fg/70">{thesis.timeHorizon}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
