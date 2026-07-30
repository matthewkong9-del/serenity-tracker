"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ── types ──

interface TriageClaim {
  id: number;
  text: string;
  status: string;
  researchStatus: string;
  researchedAt: string | null;
  evidence: string | null;
  humanNote: string | null;
  extractionConfidence: number | null;
  createdAt: string;
  stock: { ticker: string; name: string | null };
  tweet: { content: string; timestamp: string | null } | null;
}

interface StockGroup {
  ticker: string;
  name: string | null;
  fileCount: number;
  claims: TriageClaim[];
}

interface TriageData {
  stocks: StockGroup[];
  summary: {
    totalUnverified: number;
    totalStocks: number;
    stocksWithDocs: number;
    stocksWithoutDocs: number;
  };
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

// ── component ──

export default function TriageContent() {
  const [data, setData] = useState<TriageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedStocks, setExpandedStocks] = useState<Set<string>>(new Set());
  const [expandedTweets, setExpandedTweets] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [actionLoading, setActionLoading] = useState<{
    claim?: number;
    stock?: string;
  } | null>(null);

  function refresh() {
    setLoading(true);
    setError("");
    fetch("/api/triage")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: TriageData) => {
        setData(d);
        // Auto-expand first 5 stocks
        setExpandedStocks(
          new Set(d.stocks.slice(0, 5).map((s) => s.ticker))
        );
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  function toggleStock(ticker: string) {
    setExpandedStocks((prev) => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });
  }

  function expandAll() {
    if (!data) return;
    setExpandedStocks(new Set(data.stocks.map((s) => s.ticker)));
  }

  function collapseAll() {
    setExpandedStocks(new Set());
  }

  function toggleTweet(id: number) {
    setExpandedTweets((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function reResearch(claimId: number) {
    setActionLoading({ claim: claimId });
    await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimIds: [claimId], limit: 1 }),
    });
    setActionLoading(null);
    refresh();
  }

  async function verifyOne(claimId: number, ticker: string) {
    setActionLoading({ claim: claimId });
    const res = await fetch(
      `/api/stocks/${ticker}/claims/${claimId}/verify`,
      { method: "POST" }
    );
    setActionLoading(null);
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Verification failed");
    }
    refresh();
  }

  async function verifyAll(ticker: string) {
    setActionLoading({ stock: ticker });
    const res = await fetch(`/api/stocks/${ticker}/verify-all`, {
      method: "POST",
    });
    setActionLoading(null);
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Batch verification failed");
    }
    refresh();
  }

  async function saveNote(claimId: number, ticker: string) {
    await fetch(`/api/stocks/${ticker}/claims/${claimId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ humanNote: editText }),
    });
    setEditingId(null);
    refresh();
  }

  // ── render ──

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-fg mb-2">Triage</h1>
        <p className="text-muted text-sm mb-8">Loading unverified claims...</p>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-xl p-6 animate-pulse"
            >
              <div className="h-4 bg-bg rounded w-48 mb-4" />
              <div className="h-3 bg-bg rounded w-full mb-2" />
              <div className="h-3 bg-bg rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-fg mb-2">Triage</h1>
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 text-sm text-red-400">
          Failed to load: {error}
          <button onClick={refresh} className="ml-3 underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.stocks.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-fg mb-2">Triage</h1>
        <p className="text-muted text-center py-20">
          All claims verified! 🎉
        </p>
      </div>
    );
  }

  const { stocks, summary } = data;
  const allExpanded = expandedStocks.size === stocks.length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fg">Triage</h1>
          <p className="text-muted text-sm mt-1">
            {summary.totalUnverified} unverified across {summary.totalStocks}{" "}
            stocks · {summary.stocksWithDocs} have docs,{" "}
            {summary.stocksWithoutDocs} don&apos;t
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="text-xs border border-border text-muted px-3 py-2 rounded-lg hover:text-fg hover:border-muted transition"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      {/* Stock sections */}
      <div className="space-y-4">
        {stocks.map((stock) => {
          const isExpanded = expandedStocks.has(stock.ticker);
          const isVerifyingStock =
            actionLoading?.stock === stock.ticker;

          return (
            <div
              key={stock.ticker}
              className="bg-surface border border-border rounded-xl overflow-hidden"
            >
              {/* Stock header */}
              <button
                onClick={() => toggleStock(stock.ticker)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg/50 transition text-left"
              >
                {/* Expand icon */}
                <span
                  className={`text-muted text-xs transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>

                {/* Ticker + name */}
                <Link
                  href={`/stocks/${stock.ticker}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-semibold text-accent hover:underline"
                >
                  ${stock.ticker}
                </Link>
                {stock.name && (
                  <span className="text-xs text-muted truncate">
                    {stock.name}
                  </span>
                )}

                {/* Claim count */}
                <span className="text-xs text-muted">
                  ({stock.claims.length} unverified)
                </span>

                {/* Doc count */}
                {stock.fileCount === 0 ? (
                  <Link
                    href={`/stocks/${stock.ticker}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-yellow-400 hover:underline ml-auto"
                  >
                    No docs — upload
                  </Link>
                ) : (
                  <span className="text-[10px] text-muted ml-auto">
                    {stock.fileCount} doc{stock.fileCount !== 1 ? "s" : ""}
                  </span>
                )}

                {/* Verify all */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    verifyAll(stock.ticker);
                  }}
                  disabled={isVerifyingStock}
                  className="text-[10px] border border-accent/30 text-accent px-2 py-1 rounded hover:bg-accent/10 transition disabled:opacity-50 disabled:cursor-wait"
                >
                  {isVerifyingStock ? "Verifying..." : "Verify all"}
                </button>
              </button>

              {/* Claims */}
              {isExpanded && (
                <div className="border-t border-border">
                  {stock.claims.map((claim) => {
                    const isLoadingClaim =
                      actionLoading?.claim === claim.id;
                    const tweetId = claim.tweet
                      ? `tweet-${claim.id}`
                      : null;

                    return (
                      <div
                        key={claim.id}
                        className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-bg/30 transition"
                      >
                        {/* Claim text */}
                        <p className="text-sm text-fg/90 leading-relaxed mb-2">
                          &ldquo;{claim.text}&rdquo;
                        </p>

                        {/* Source tweet */}
                        {claim.tweet && (
                          <div className="mb-2">
                            {(() => {
                              const isLong =
                                claim.tweet.content.length > 200;
                              const showFull =
                                tweetId &&
                                expandedTweets.has(claim.id);
                              return (
                                <div className="bg-bg/50 border border-border rounded-lg p-2">
                                  <p className="text-[11px] text-muted leading-relaxed">
                                    {isLong && !showFull
                                      ? claim.tweet.content.slice(0, 200) +
                                        "…"
                                      : claim.tweet.content}
                                  </p>
                                  {isLong && (
                                    <button
                                      onClick={() =>
                                        toggleTweet(claim.id)
                                      }
                                      className="text-[10px] text-accent hover:underline mt-1"
                                    >
                                      {showFull
                                        ? "Show less"
                                        : "Show full tweet"}
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Meta row */}
                        <div className="flex items-center gap-2 mb-3">
                          <span
                            className={`text-[10px] border rounded-full px-2 py-0.5 ${
                              STATUS_COLORS[claim.status] ||
                              STATUS_COLORS.unverified
                            }`}
                            title="AI verdict — set by the research pipeline"
                          >
                            {claim.status}
                          </span>
                          <span
                            className={`text-[10px] border rounded-full px-2 py-0.5 ${
                              RESEARCH_COLORS[claim.researchStatus] ||
                              ""
                            }`}
                          >
                            {claim.researchStatus}
                          </span>
                          {claim.extractionConfidence != null &&
                            claim.extractionConfidence <= 2 && (
                              <span className="text-[10px] bg-yellow-900/30 text-yellow-400 border border-yellow-700 rounded-full px-2 py-0.5">
                                low conf
                              </span>
                            )}
                          <span className="text-[10px] text-muted/50">
                            {new Date(
                              claim.createdAt
                            ).toLocaleDateString()}
                          </span>
                        </div>

                        {/* AI evidence (read-only) */}
                        {claim.evidence && (
                          <div className="mb-3">
                            <p className="text-[11px] text-fg/60 bg-bg/50 border border-border rounded-lg p-2 whitespace-pre-wrap line-clamp-3">
                              <span className="text-muted/60">AI evidence · </span>
                              {claim.evidence}
                            </p>
                          </div>
                        )}

                        {/* Human note (editable) */}
                        {editingId === claim.id ? (
                          <div className="mb-3 space-y-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-fg min-h-[80px] resize-none"
                              autoFocus
                              placeholder="Your observations on this claim..."
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveNote(claim.id, stock.ticker)}
                                className="text-[10px] bg-accent text-bg px-2 py-1 rounded"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-[10px] text-muted hover:text-fg"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : claim.humanNote ? (
                          <div className="mb-3">
                            <p className="text-[11px] text-fg/60 bg-bg/50 border border-border rounded-lg p-2 whitespace-pre-wrap line-clamp-3">
                              <span className="text-muted/60">Your note · </span>
                              {claim.humanNote}
                            </p>
                            <button
                              onClick={() => {
                                setEditText(claim.humanNote || "");
                                setEditingId(claim.id);
                              }}
                              className="text-[10px] text-muted hover:text-fg mt-1"
                            >
                              Edit note
                            </button>
                          </div>
                        ) : null}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              setEditText(claim.humanNote || "");
                              setEditingId(claim.id);
                            }}
                            className="text-[10px] text-muted hover:text-fg"
                          >
                            {claim.humanNote ? "edit note" : "+ note"}
                          </button>
                          <span className="text-muted/20 mx-1">|</span>
                          <button
                            onClick={() => reResearch(claim.id)}
                            disabled={isLoadingClaim}
                            className="text-[10px] text-muted hover:text-fg disabled:opacity-50"
                          >
                            {claim.researchStatus === "done"
                              ? "re-research"
                              : "research"}
                          </button>
                          <button
                            onClick={() => verifyOne(claim.id, stock.ticker)}
                            disabled={isLoadingClaim}
                            className="text-[10px] text-accent hover:underline disabled:opacity-50"
                          >
                            verify
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
