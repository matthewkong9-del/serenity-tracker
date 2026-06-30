"use client";

import { useEffect, useState, useMemo } from "react";

interface Claim {
  id: number;
  text: string;
  status: string;
}

interface Priority {
  claimId: number;
  priority: number;
  reason: string;
}

interface ResearchPrioritiesProps {
  claims: Claim[];
  ticker: string;
  onVerify: (claimId: number) => void;
  verifyingClaimId: number | null;
}

export function ResearchPriorities({
  claims,
  ticker,
  onVerify,
  verifyingClaimId,
}: ResearchPrioritiesProps) {
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Re-fetch only when the set of unverified claim IDs changes
  const unverifiedIds = useMemo(
    () =>
      claims
        .filter((c) => c.status === "unverified")
        .map((c) => c.id)
        .sort()
        .join(","),
    [claims]
  );

  useEffect(() => {
    if (!unverifiedIds) {
      setPriorities([]);
      return;
    }
    setLoading(true);
    setError("");
    fetch(`/api/stocks/${ticker}/rank-claims`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => setPriorities(data.priorities || []))
      .catch(() => setError("Failed to rank priorities"))
      .finally(() => setLoading(false));
  }, [unverifiedIds, ticker]);

  const unverifiedClaims = claims.filter((c) => c.status === "unverified");

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs text-muted uppercase tracking-wider font-semibold">
          🔍 Research Priorities
        </h2>
        {priorities.length > 0 && !loading && (
          <button
            onClick={() => {
              setPriorities([]);
              setError("");
            }}
            className="text-accent text-xs hover:underline"
          >
            Re-rank
          </button>
        )}
      </div>

      {unverifiedClaims.length === 0 ? (
        <p className="text-muted text-xs">All claims verified 🎉</p>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse bg-bg rounded-lg h-12"
            />
          ))}
        </div>
      ) : error ? (
        <div>
          <p className="text-red-400 text-xs mb-2">{error}</p>
          <button
            onClick={() => {
              setPriorities([]);
              setError("");
            }}
            className="text-accent text-xs hover:underline"
          >
            Retry
          </button>
        </div>
      ) : priorities.length === 0 ? (
        <p className="text-muted text-xs">
          {unverifiedClaims.length} unverified claim
          {unverifiedClaims.length > 1 ? "s" : ""}. Click &ldquo;Re-rank&rdquo; to
          prioritize by impact.
        </p>
      ) : (
        <div className="space-y-3">
          {priorities.map((p) => {
            const claim = claims.find((c) => c.id === p.claimId);
            if (!claim) return null;
            return (
              <div
                key={p.claimId}
                className="flex items-start gap-3 bg-bg rounded-lg p-3 border border-border"
              >
                <span className="text-xs bg-surface border border-border rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-muted">
                  {p.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-fg text-sm leading-relaxed line-clamp-2">
                    {claim.text}
                  </p>
                  <p className="text-muted/70 text-xs mt-1 italic line-clamp-1">
                    {p.reason}
                  </p>
                </div>
                <button
                  onClick={() => onVerify(claim.id)}
                  disabled={verifyingClaimId === claim.id}
                  className={`text-xs px-2.5 py-1 rounded border transition shrink-0 ${
                    verifyingClaimId === claim.id
                      ? "border-border text-muted cursor-wait"
                      : "border-accent/30 text-accent hover:bg-accent/10"
                  }`}
                >
                  {verifyingClaimId === claim.id ? "..." : "Verify"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
