"use client";

import { useState } from "react";

interface ThesisDriftResult {
  direction: "strengthening" | "weakening" | "holding" | "unclear";
  confidence: "high" | "medium" | "low";
  summary: string;
  shifts: { claim: string; status: string; impact: string }[];
}

interface ThesisDriftProps {
  summary: string | null;
  ticker: string;
  resolvedClaimCount: number;
}

const DIRECTION_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  strengthening: {
    label: "Strengthening",
    color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
    icon: "↑",
  },
  weakening: {
    label: "Weakening",
    color: "text-red-400 border-red-400/30 bg-red-400/10",
    icon: "↓",
  },
  holding: {
    label: "Holding",
    color: "text-amber-400 border-amber-400/30 bg-amber-400/10",
    icon: "→",
  },
  unclear: {
    label: "Unclear",
    color: "text-slate-400 border-slate-400/30 bg-slate-400/10",
    icon: "?",
  },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-slate-400",
};

const STATUS_COLORS: Record<string, string> = {
  supported: "text-emerald-400",
  refuted: "text-red-400",
  disputed: "text-blue-400",
};

export function ThesisDrift({ summary, ticker, resolvedClaimCount }: ThesisDriftProps) {
  const [drift, setDrift] = useState<ThesisDriftResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  async function checkDrift() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/stocks/${ticker}/thesis-drift`, {
      method: "POST",
    });
    setLoading(false);

    if (res.ok) {
      setDrift(await res.json());
    } else {
      const data = await res.json();
      setError(data.error || "Failed to check drift");
    }
  }

  const canCheck = summary && resolvedClaimCount > 0 && !drift;

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-muted uppercase tracking-wider font-semibold">
          📉 Thesis Drift
        </h2>
        <div className="flex items-center gap-2">
          {drift && !loading && (
            <button onClick={() => setDrift(null)} className="text-accent text-xs hover:underline">
              Re-check
            </button>
          )}
          {canCheck && (
            <button
              onClick={checkDrift}
              disabled={loading}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                loading
                  ? "border border-border text-muted cursor-wait"
                  : "border border-accent/30 text-accent hover:bg-accent/10"
              }`}
            >
              {loading ? "Analyzing..." : "Check Drift"}
            </button>
          )}
        </div>
      </div>

      {!summary ? (
        <p className="text-muted text-xs">
          No summary yet. Run a summary first to establish a thesis baseline.
        </p>
      ) : resolvedClaimCount === 0 ? (
        <p className="text-muted text-xs">
          No verified or refuted claims yet. Verify some claims to detect thesis drift.
        </p>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-bg rounded-lg h-8" />
          ))}
        </div>
      ) : error ? (
        <p className="text-red-400 text-xs">{error}</p>
      ) : drift ? (
        <div className="space-y-4">
          {/* Direction badge */}
          <div className="flex items-center gap-3">
            <span
              className={`text-sm border rounded-full px-3 py-1 font-semibold ${
                DIRECTION_CONFIG[drift.direction].color
              }`}
            >
              {DIRECTION_CONFIG[drift.direction].icon} {DIRECTION_CONFIG[drift.direction].label}
            </span>
            <span className={`text-xs ${CONFIDENCE_COLORS[drift.confidence]}`}>
              {drift.confidence} confidence
            </span>
          </div>

          {/* Summary */}
          <p className="text-fg/80 text-sm leading-relaxed">{drift.summary}</p>

          {/* Shifts */}
          {drift.shifts.length > 0 && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-muted hover:text-fg transition"
              >
                {expanded ? "Hide" : "Show"} evidence shifts ({drift.shifts.length})
              </button>
              {expanded && (
                <div className="mt-3 space-y-2">
                  {drift.shifts.map((s, i) => (
                    <div key={i} className="bg-bg rounded-lg p-3 border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs border rounded-full px-2 py-0.5 ${STATUS_COLORS[s.status] || "text-muted"} bg-bg`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <p className="text-fg/70 text-xs line-clamp-2">{s.claim}</p>
                      <p className="text-muted/70 text-xs mt-1 italic">{s.impact}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted text-xs">
          {resolvedClaimCount} resolved claim{resolvedClaimCount !== 1 ? "s" : ""}. Click
          &ldquo;Check Drift&rdquo; to analyze whether the thesis is holding.
        </p>
      )}
    </div>
  );
}
