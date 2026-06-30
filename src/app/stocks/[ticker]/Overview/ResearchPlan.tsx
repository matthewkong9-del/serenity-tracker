"use client";

import { useState } from "react";

interface ResearchPlan {
  summary: string;
  priorityDocuments: string[];
  priorityClaims: { claimId: number; text: string; reason: string }[];
  gaps: string[];
  nextSteps: string[];
}

interface ResearchPlanProps {
  ticker: string;
}

export function ResearchPlan({ ticker }: ResearchPlanProps) {
  const [plan, setPlan] = useState<ResearchPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/stocks/${ticker}/research-plan`, {
      method: "POST",
    });
    setLoading(false);

    if (res.ok) {
      setPlan(await res.json());
    } else {
      const data = await res.json();
      setError(data.error || "Failed to generate plan");
    }
  }

  if (!plan && !loading && !error) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs text-muted uppercase tracking-wider font-semibold">
            🧭 Research Plan
          </h2>
          <button
            onClick={generate}
            className="text-xs px-3 py-1.5 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition font-medium"
          >
            Dig Deeper
          </button>
        </div>
        <p className="text-muted text-xs">
          Generate an AI research plan: which documents to find, which claims to verify, and what
          gaps are holding this stock back.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-muted uppercase tracking-wider font-semibold">
          🧭 Research Plan
        </h2>
        <div className="flex items-center gap-2">
          {plan && !loading && (
            <button onClick={() => setPlan(null)} className="text-accent text-xs hover:underline">
              Regenerate
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse bg-bg rounded-lg h-8" />
          ))}
        </div>
      ) : error ? (
        <p className="text-red-400 text-xs">{error}</p>
      ) : plan ? (
        <div className="space-y-5">
          {/* Summary */}
          <p className="text-fg/80 text-sm leading-relaxed">{plan.summary}</p>

          {/* Priority documents */}
          {plan.priorityDocuments.length > 0 && (
            <div>
              <h3 className="text-xs text-muted font-semibold uppercase tracking-wider mb-2">
                📄 Documents to Find
              </h3>
              <ul className="space-y-1.5">
                {plan.priorityDocuments.map((d, i) => (
                  <li key={i} className="text-fg/70 text-sm flex items-start gap-2">
                    <span className="text-accent mt-0.5">•</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Priority claims */}
          {plan.priorityClaims.length > 0 && (
            <div>
              <h3 className="text-xs text-muted font-semibold uppercase tracking-wider mb-2">
                🎯 Claims to Verify First
              </h3>
              <ul className="space-y-2">
                {plan.priorityClaims.map((c, i) => (
                  <li key={i} className="bg-bg rounded-lg p-3 border border-border">
                    <p className="text-fg/80 text-sm">{c.text}</p>
                    <p className="text-muted/60 text-xs mt-1 italic">{c.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Gaps */}
          {plan.gaps.length > 0 && (
            <div>
              <h3 className="text-xs text-muted font-semibold uppercase tracking-wider mb-2">
                🕳️ Knowledge Gaps
              </h3>
              <ul className="space-y-1">
                {plan.gaps.map((g, i) => (
                  <li key={i} className="text-fg/60 text-xs flex items-start gap-2">
                    <span className="text-amber-400">⚠</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next steps */}
          {plan.nextSteps.length > 0 && (
            <div>
              <h3 className="text-xs text-muted font-semibold uppercase tracking-wider mb-2">
                ✅ Next Steps
              </h3>
              <ol className="space-y-1.5">
                {plan.nextSteps.map((s, i) => (
                  <li key={i} className="text-fg/70 text-sm flex items-start gap-2">
                    <span className="text-accent text-xs font-mono mt-0.5">{i + 1}.</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
