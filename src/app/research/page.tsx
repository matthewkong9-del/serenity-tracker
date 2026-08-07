"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Claim {
  id: number;
  text: string;
  status: string;
  researchStatus: string | null;
  extractionConfidence: number | null;
  impactScore: number | null;
  stock: { ticker: string; name: string | null };
  tweet: { content: string; timestamp: string | null } | null;
}

export default function ResearchPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [counts, setCounts] = useState({ pending: 0, done: 0, researching: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [result, setResult] = useState("");
  const [filter, setFilter] = useState("pending");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/research?filter=${filter}`)
      .then((r) => r.json())
      .then((data) => {
        setClaims(data.claims);
        setCounts(data.counts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function researchAll() {
    setResearching(true);
    setResult("");
    try {
      const ids = claims.map((c) => c.id);
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimIds: ids }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Server returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
      }
      const data = await res.json();
      setResult(`Researched ${data.researched}, ${data.failed || 0} failed. ${data.remaining} remaining.`);
      load();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    }
    setResearching(false);
  }

  const impactEmoji = (score: number | null) => {
    if (!score) return "";
    if (score >= 4) return "🔴";
    if (score >= 3) return "🟡";
    return "🟢";
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Research Queue</h1>
          <p className="text-sm text-muted mt-1">
            Claims that need web research to verify or refute.
          </p>
        </div>
        {filter === "pending" && claims.length > 0 && (
          <button
            onClick={researchAll}
            disabled={researching}
            className="px-4 py-2 bg-accent text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {researching ? "Researching…" : `Deep research ${claims.length} claim(s)`}
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["pending", "researching", "done", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f
                ? "bg-accent/10 text-accent border-accent/30"
                : "border-border text-muted hover:text-fg"
            }`}
          >
            {f} ({counts[f] || 0})
          </button>
        ))}
      </div>

      {/* Result toast */}
      {result && (
        <div className="bg-surface border border-border rounded-lg px-4 py-3 mb-4 text-sm">{result}</div>
      )}

      {/* Claims */}
      {loading ? (
        <div className="text-sm text-muted py-10 text-center">Loading…</div>
      ) : claims.length === 0 ? (
        <div className="text-sm text-muted py-10 text-center">
          {filter === "pending" ? "Nothing to research. 🎉" : "No claims in this category."}
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map((c) => (
            <div
              key={c.id}
              className="bg-surface border border-border rounded-lg p-4 text-sm"
            >
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted shrink-0 mt-0.5">
                  {impactEmoji(c.impactScore)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Link
                      href={`/stocks/${c.stock.ticker}`}
                      className="text-accent font-medium hover:underline"
                    >
                      ${c.stock.ticker}
                    </Link>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full border ${
                        c.status === "unverified"
                          ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
                          : "text-green-400 border-green-400/30 bg-green-400/10"
                      }`}
                    >
                      {c.status}
                    </span>
                    {c.researchStatus && c.researchStatus !== "pending" && (
                      <span className="text-xs text-muted">{c.researchStatus}</span>
                    )}
                  </div>
                  <p className="text-fg leading-relaxed">{c.text}</p>
                  {c.tweet && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted cursor-pointer hover:text-fg">
                        Source tweet
                      </summary>
                      <p className="text-xs text-muted mt-1 bg-black/20 rounded p-2 whitespace-pre-wrap">
                        {c.tweet.content.slice(0, 300)}
                        {c.tweet.content.length > 300 ? "…" : ""}
                      </p>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
