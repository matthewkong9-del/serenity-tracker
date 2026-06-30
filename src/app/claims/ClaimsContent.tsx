"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Claim {
  id: number;
  text: string;
  source: string | null;
  status: string;
  evidence: string | null;
  tweetId: number | null;
  createdAt: string;
  updatedAt: string;
  stock: { ticker: string; name: string | null };
  tweet: { id: number; content: string; timestamp: string | null } | null;
}

const CLAIM_STATUSES = ["unverified", "supported", "refuted", "disputed"] as const;

const CLAIM_COLORS: Record<string, string> = {
  unverified: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  supported: "text-green-400 border-green-400/30 bg-green-400/10",
  refuted: "text-red-400 border-red-400/30 bg-red-400/10",
  disputed: "text-blue-400 border-blue-400/30 bg-blue-400/10",
};

function getSearchParams() {
  if (typeof window === "undefined") return { status: "", search: "", tweetId: "" };
  const sp = new URLSearchParams(window.location.search);
  return {
    status: sp.get("status") || "",
    search: sp.get("search") || "",
    tweetId: sp.get("tweetId") || "",
  };
}

export default function ClaimsContent() {
  const router = useRouter();

  const [initialParams] = useState(getSearchParams);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({
    unverified: 0,
    supported: 0,
    refuted: 0,
    disputed: 0,
  });
  const [status, setStatus] = useState(initialParams.status || "all");
  const [search, setSearch] = useState(initialParams.search);
  const [tweetId] = useState(initialParams.tweetId);
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingClaimId, setEditingClaimId] = useState<number | null>(null);
  const [editEvidence, setEditEvidence] = useState("");
  const [expandedTweets, setExpandedTweets] = useState<Set<number>>(new Set());
  const [verifyingClaimId, setVerifyingClaimId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    if (tweetId) params.set("tweetId", tweetId);
    params.set("sort", sort);

    fetch(`/api/claims?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setClaims(data.claims);
        setCounts(data.counts);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [status, search, tweetId, sort]);

  useEffect(() => {
    load();
  }, [load]);

  async function cycleClaimStatus(claim: Claim) {
    const idx = CLAIM_STATUSES.indexOf(claim.status as any);
    const next = CLAIM_STATUSES[(idx + 1) % CLAIM_STATUSES.length];
    await fetch(`/api/stocks/${claim.stock.ticker}/claims/${claim.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  function startEditClaim(claim: Claim) {
    setEditingClaimId(claim.id);
    setEditEvidence(claim.evidence || "");
  }

  async function saveClaimEvidence(ticker: string, claimId: number) {
    await fetch(`/api/stocks/${ticker}/claims/${claimId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence: editEvidence }),
    });
    setEditingClaimId(null);
    setEditEvidence("");
    load();
  }

  async function handleVerifyClaim(ticker: string, claimId: number) {
    setVerifyingClaimId(claimId);
    const res = await fetch(`/api/stocks/${ticker}/claims/${claimId}/verify`, {
      method: "POST",
    });
    setVerifyingClaimId(null);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Verification failed");
    }
    load();
  }

  function toggleTweet(id: number) {
    setExpandedTweets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const totalClaims =
    (counts.unverified || 0) +
    (counts.supported || 0) +
    (counts.refuted || 0) +
    (counts.disputed || 0);

  const stocksWithClaims = new Set(claims.map((c) => c.stock.ticker)).size;

  return (
    <div>
      {/* Header + Stats */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fg">Claims</h1>
        <p className="text-muted text-sm mt-1">
          {totalClaims} claims across {stocksWithClaims} stocks
        </p>

        {totalClaims > 0 && (
          <div className="flex flex-wrap gap-4 mt-3 text-xs">
            <span className="text-green-400">✅ {counts.supported || 0} verified</span>
            <span className="text-red-400">❌ {counts.refuted || 0} refuted</span>
            <span className="text-blue-400">⚔️ {counts.disputed || 0} disputed</span>
            <span className="text-yellow-400">⏳ {counts.unverified || 0} unverified</span>
          </div>
        )}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "unverified", "supported", "refuted", "disputed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition capitalize ${
                status === s
                  ? "bg-accent text-bg border-accent"
                  : "border-border text-muted hover:text-fg hover:border-muted"
              }`}
            >
              {s === "all" ? `All (${totalClaims})` : `${s} (${counts[s] || 0})`}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setSort(sort === "newest" ? "oldest" : "newest")}
          className="text-xs border border-border text-muted px-3 py-1.5 rounded-lg hover:text-fg transition"
        >
          {sort === "newest" ? "↓ Newest" : "↑ Oldest"}
        </button>

        <input
          type="text"
          placeholder="Search claims, evidence, tickers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          className="bg-surface border border-border rounded-lg px-4 py-2 text-sm text-fg w-64 placeholder:text-muted"
        />
      </div>

      {/* TweetId filter banner */}
      {tweetId && (
        <div className="bg-surface border border-border rounded-lg px-4 py-2 mb-6 flex items-center justify-between text-sm">
          <span className="text-muted">Filtered to claims from tweet #{tweetId}</span>
          <button
            onClick={() => router.push("/claims")}
            className="text-accent text-xs hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 mb-6 text-sm text-red-400">
          Failed to load claims: {error}
          <button onClick={load} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {/* Claims list */}
      {loading ? (
        <p className="text-muted text-center py-20">Loading...</p>
      ) : claims.length === 0 ? (
        <p className="text-muted text-center py-20">
          {totalClaims === 0
            ? "No claims yet. Sync tweets to extract claims."
            : "No claims match your filters."}
        </p>
      ) : (
        <div className="space-y-3">
          {claims.map((claim) => (
            <div key={claim.id} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => cycleClaimStatus(claim)}
                  className={`text-xs border rounded-full px-2.5 py-1 whitespace-nowrap mt-0.5 transition hover:opacity-80 ${
                    CLAIM_COLORS[claim.status]
                  }`}
                  title="Click to cycle: unverified → supported → refuted → disputed"
                >
                  {claim.status}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-fg text-sm leading-relaxed">{claim.text}</p>

                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <Link
                      href={`/stocks/${claim.stock.ticker}`}
                      className="text-xs text-accent hover:underline font-medium"
                    >
                      ${claim.stock.ticker}
                    </Link>
                    {claim.stock.name && (
                      <span className="text-xs text-muted">{claim.stock.name}</span>
                    )}
                    {claim.source && <span className="text-xs text-muted/70">{claim.source}</span>}
                    <span className="text-xs text-muted/50">
                      {new Date(claim.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {claim.tweet && (
                    <div className="mt-2 bg-bg rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted">
                          Source tweet
                          {claim.tweet.timestamp &&
                            ` — ${new Date(claim.tweet.timestamp).toLocaleDateString()}`}
                        </span>
                        <Link href={`/tweets`} className="text-xs text-accent hover:underline">
                          all tweets
                        </Link>
                      </div>
                      {(() => {
                        const isLong = claim.tweet.content.length > 300;
                        const showFull = expandedTweets.has(claim.tweet.id);
                        const displayContent =
                          isLong && !showFull
                            ? claim.tweet.content.slice(0, 300) + "..."
                            : claim.tweet.content;
                        return (
                          <>
                            <p className="text-fg/60 text-xs whitespace-pre-wrap leading-relaxed">
                              {displayContent}
                            </p>
                            {isLong && (
                              <button
                                onClick={() => toggleTweet(claim.tweet!.id)}
                                className="text-xs text-accent mt-1 hover:underline"
                              >
                                {showFull ? "Show less" : "Show full tweet"}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {editingClaimId === claim.id ? (
                    <div className="mt-3 space-y-3">
                      <textarea
                        value={editEvidence}
                        onChange={(e) => setEditEvidence(e.target.value)}
                        placeholder="Paste links, notes, or data that supports or refutes this claim..."
                        rows={3}
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveClaimEvidence(claim.stock.ticker, claim.id)}
                          className="bg-accent text-bg px-3 py-1.5 rounded text-xs font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingClaimId(null)}
                          className="border border-border text-muted px-3 py-1.5 rounded text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : claim.evidence ? (
                    <div className="mt-2">
                      <p className="text-fg/70 text-xs whitespace-pre-wrap bg-bg rounded-lg p-3 border border-border">
                        {claim.evidence}
                      </p>
                      <button
                        onClick={() => startEditClaim(claim)}
                        className="text-muted hover:text-fg text-xs mt-1 transition"
                      >
                        Edit evidence
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditClaim(claim)}
                      className="text-muted hover:text-fg text-xs mt-2 transition"
                    >
                      + Add evidence
                    </button>
                  )}
                  <button
                    onClick={() => handleVerifyClaim(claim.stock.ticker, claim.id)}
                    disabled={verifyingClaimId === claim.id}
                    className={`text-xs px-2.5 py-1 rounded border transition mt-2 ${
                      verifyingClaimId === claim.id
                        ? "border-border text-muted cursor-wait"
                        : "border-accent/30 text-accent hover:bg-accent/10"
                    }`}
                  >
                    {verifyingClaimId === claim.id ? "Verifying..." : "🔍 Verify"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
