"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

// ── types ──

interface ClaimItem {
  id: number;
  text: string;
  status: string;
  researchStatus: string;
  researchedAt: string | null;
  evidence: string | null;
  extractionConfidence: number | null;
  createdAt: string;
  stock: { ticker: string; name: string | null };
  tweet: { content: string; timestamp: string | null } | null;
}

interface ResearchData {
  claims: ClaimItem[];
  counts: { pending: number; done: number; researching: number; failed: number; total: number };
  estimatedCost: string;
}

// ── helpers ──

const STATUS_COLORS: Record<string, string> = {
  unverified: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  supported: "text-green-400 border-green-400/30 bg-green-400/10",
  refuted: "text-red-400 border-red-400/30 bg-red-400/10",
  disputed: "text-purple-400 border-purple-400/30 bg-purple-400/10",
};

const RESEARCH_COLORS: Record<string, string> = {
  pending: "text-muted border-border bg-muted/10",
  researching: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  done: "text-green-400 border-green-400/30 bg-green-400/10",
  failed: "text-red-400 border-red-400/30 bg-red-400/10",
};

const STATUS_LABELS: Record<string, string> = {
  unverified: "unverified",
  supported: "supported",
  refuted: "refuted",
  disputed: "disputed",
};

function dateLabel(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── page ──

export default function ResearchPage() {
  const [data, setData] = useState<ResearchData | null>(null);
  const [filter, setFilter] = useState("pending");
  const [researching, setResearching] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  function refresh() {
    fetch(`/api/research?filter=${filter}&limit=100`)
      .then((r) => r.json())
      .then(setData);
  }

  useEffect(() => {
    refresh();
  }, [filter]);

  async function runResearch(limit: number) {
    setResearching(true);
    await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    });
    setResearching(false);
    refresh();
  }

  async function researchOne(claimId: number) {
    await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimIds: [claimId], limit: 1 }),
    });
    refresh();
  }

  async function cycleStatus(claimId: number, ticker: string, current: string) {
    const order = ["unverified", "supported", "refuted", "disputed"];
    const next = order[(order.indexOf(current) + 1) % order.length];
    await fetch(`/api/stocks/${ticker}/claims/${claimId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    refresh();
  }

  async function saveEvidence(claimId: number, ticker: string) {
    await fetch(`/api/stocks/${ticker}/claims/${claimId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence: editText }),
    });
    setEditingId(null);
    refresh();
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Group by date for timeline feel
  const grouped = useMemo(() => {
    if (!data) return {};
    const g: Record<string, ClaimItem[]> = {};
    for (const c of data.claims) {
      const key = dateLabel(c.researchedAt || c.createdAt) || "Unsorted";
      (g[key] ||= []).push(c);
    }
    return g;
  }, [data]);

  // ── render ──

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fg">Research</h1>
          <p className="text-muted text-sm mt-1">
            {data
              ? `${data.counts.pending} pending · ${data.counts.done} done · ~$${data.estimatedCost} to research all`
              : "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runResearch(10)}
            disabled={researching}
            className="text-xs border border-border text-muted px-3 py-2 rounded-lg hover:text-accent hover:border-accent/30 transition disabled:opacity-50"
          >
            Research 10
          </button>
          <button
            onClick={() => runResearch(50)}
            disabled={researching}
            className="text-xs bg-accent text-bg px-3 py-2 rounded-lg hover:bg-accent/90 transition disabled:opacity-50"
          >
            {researching ? "Researching..." : "Research 50"}
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(["pending", "done", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border transition ${
              filter === f
                ? "bg-accent text-bg border-accent"
                : "border-border text-muted hover:text-fg hover:border-muted"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {data ? ` (${data.counts[f]})` : ""}
          </button>
        ))}
      </div>

      {/* Claim list */}
      {!data ? (
        <p className="text-muted text-center py-20">Loading...</p>
      ) : data.claims.length === 0 ? (
        <p className="text-muted text-center py-20">
          {filter === "pending"
            ? "All claims researched! 🎉"
            : "No claims in this category."}
        </p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([label, items]) => (
            <section key={label}>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 sticky top-14 bg-bg/80 backdrop-blur py-1 z-10">
                {label} ({items.length})
              </h2>
              <div className="space-y-3">
                {items.map((claim) => {
                  const showFull = expanded.has(claim.id);
                  const isEditing = editingId === claim.id;

                  return (
                    <div
                      key={claim.id}
                      className="bg-surface border border-border rounded-xl overflow-hidden"
                    >
                      {/* Top bar: stock + badges */}
                      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                        <Link
                          href={`/stocks/${claim.stock.ticker}`}
                          className="text-xs font-semibold text-accent hover:underline"
                        >
                          ${claim.stock.ticker}
                        </Link>
                        {claim.stock.name && (
                          <span className="text-[11px] text-muted truncate">
                            {claim.stock.name}
                          </span>
                        )}
                        <span className="flex-1" />
                        <button
                          onClick={() => cycleStatus(claim.id, claim.stock.ticker, claim.status)}
                          className={`text-[10px] border rounded-full px-2 py-0.5 transition ${
                            STATUS_COLORS[claim.status] || STATUS_COLORS.unverified
                          }`}
                          title="Click to cycle: unverified→supported→refuted→disputed"
                        >
                          {STATUS_LABELS[claim.status] || claim.status}
                        </button>
                        <span
                          className={`text-[10px] border rounded-full px-2 py-0.5 ${
                            RESEARCH_COLORS[claim.researchStatus] || ""
                          }`}
                        >
                          {claim.researchStatus}
                        </span>
                      </div>

                      {/* Claim text */}
                      <p className="px-4 py-1 text-sm text-fg/90 leading-relaxed">
                        &ldquo;{claim.text}&rdquo;
                      </p>

                      {/* Source tweet (collapsed) */}
                      {claim.tweet && (
                        <div className="px-4 pb-1">
                          <p className="text-[11px] text-muted truncate">
                            from tweet: {claim.tweet.content.slice(0, 100)}
                            {claim.tweet.content.length > 100 ? "…" : ""}
                          </p>
                        </div>
                      )}

                      {/* Verdict / Evidence */}
                      {claim.evidence && claim.researchStatus === "done" && (
                        <div className="mx-4 mb-3 mt-2 bg-bg/50 border border-border rounded-lg p-3">
                          <p className="text-xs text-fg/70 leading-relaxed whitespace-pre-wrap">
                            {isEditing ? (
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full bg-bg border border-border rounded p-2 text-xs text-fg min-h-[100px]"
                                autoFocus
                              />
                            ) : showFull ? (
                              claim.evidence
                            ) : (
                              claim.evidence.slice(0, 250) +
                              (claim.evidence.length > 250 ? "…" : "")
                            )}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            {claim.evidence.length > 250 && !isEditing && (
                              <button
                                onClick={() => toggle(claim.id)}
                                className="text-[10px] text-accent hover:underline"
                              >
                                {showFull ? "Show less" : "Show full"}
                              </button>
                            )}
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEvidence(claim.id, claim.stock.ticker)}
                                  className="text-[10px] bg-accent text-bg px-2 py-0.5 rounded"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="text-[10px] text-muted hover:text-fg"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditText(claim.evidence || "");
                                  setEditingId(claim.id);
                                }}
                                className="text-[10px] text-muted hover:text-fg"
                              >
                                Edit evidence
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Actions footer */}
                      <div className="flex items-center gap-3 px-4 pb-3 pt-1">
                        <span className="text-[10px] text-muted">
                          {claim.researchedAt
                            ? `Researched ${dateLabel(claim.researchedAt)}`
                            : `Created ${dateLabel(claim.createdAt)}`}
                        </span>
                        <span className="flex-1" />
                        {claim.researchStatus !== "researching" && (
                          <button
                            onClick={() => researchOne(claim.id)}
                            className="text-[10px] text-accent hover:underline"
                          >
                            {claim.researchStatus === "done"
                              ? "Re-research"
                              : "Research"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
