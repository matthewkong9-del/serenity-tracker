"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

/**
 * Claims Review — the human research workspace.
 *
 * Lists disputed, refuted, and unverified claims in one place (the "needs
 * review" pile). Each claim shows what the AI found, then lets the user
 * complete the research themselves: pick a verdict and enter the evidence.
 * Saving marks the claim researchStatus="done" so it leaves the AI research
 * queue.
 */

interface Claim {
  id: number;
  text: string;
  source: string | null;
  status: string;
  evidence: string | null;
  humanNote: string | null;
  impactScore: number | null;
  insightType: string | null;
  researchStatus: string;
  createdAt: string;
  stock: { ticker: string; name: string | null };
  tweet: { id: number; content: string; timestamp: string | null } | null;
}

const CLAIM_COLORS: Record<string, string> = {
  unverified: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  supported: "text-green-400 border-green-400/30 bg-green-400/10",
  refuted: "text-red-400 border-red-400/30 bg-red-400/10",
  disputed: "text-blue-400 border-blue-400/30 bg-blue-400/10",
};

const STATUS_OPTIONS = ["unverified", "supported", "refuted", "disputed"];

/** Tabs: "review" = the combined needs-review pile; others = single statuses. */
const TABS = [
  { key: "review", label: "Needs review", statuses: "disputed,refuted,unverified" },
  { key: "disputed", label: "Disputed", statuses: "disputed" },
  { key: "refuted", label: "Refuted", statuses: "refuted" },
  { key: "unverified", label: "Unverified", statuses: "unverified" },
] as const;

function impactBadge(score: number | null) {
  if (!score) return null;
  if (score >= 4) return "🔴";
  if (score >= 3) return "🟡";
  return "🟢";
}

export default function ReviewContent() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("review");
  const [sort, setSort] = useState("impact");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Manual research editor state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState("unverified");
  const [editEvidence, setEditEvidence] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [expandedTweets, setExpandedTweets] = useState<Set<number>>(new Set());

  const activeTab = TABS.find((t) => t.key === tab)!;

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    params.set("statuses", activeTab.statuses);
    if (sort) params.set("sort", sort);
    if (search) params.set("search", search);
    params.set("limit", "200");

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
  }, [activeTab.statuses, sort, search]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(claim: Claim) {
    setEditingId(claim.id);
    setEditStatus(claim.status);
    setEditEvidence(claim.evidence || "");
    setSavedId(null);
  }

  async function saveVerdict(claimId: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/claims/${claimId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: editStatus, evidence: editEvidence }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Save failed (${res.status})`);
      } else {
        setEditingId(null);
        setSavedId(claimId);
        setTimeout(() => setSavedId(null), 2500);
        load();
      }
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function toggleTweet(id: number) {
    setExpandedTweets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const reviewCount =
    (counts.disputed || 0) + (counts.refuted || 0) + (counts.unverified || 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-fg">Claims Review</h1>
        <p className="text-muted text-sm mt-1">
          Your research workspace — disputed, refuted, and unverified claims.{" "}
          {reviewCount > 0 && (
            <span className="text-amber-400">{reviewCount} awaiting your verdict</span>
          )}
        </p>
        <div className="flex flex-wrap gap-4 mt-3 text-xs">
          <span className="text-blue-400">⚔️ {counts.disputed || 0} disputed</span>
          <span className="text-red-400">❌ {counts.refuted || 0} refuted</span>
          <span className="text-yellow-400">⏳ {counts.unverified || 0} unverified</span>
        </div>
      </div>

      {/* Tabs + tools */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition capitalize ${
                tab === t.key
                  ? "bg-accent text-bg border-accent"
                  : "border-border text-muted hover:text-fg hover:border-muted"
              }`}
            >
              {t.label}
              {t.key === "review" && reviewCount > 0 ? ` (${reviewCount})` : ""}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setSort(sort === "impact" ? "newest" : "impact")}
          className="text-xs border border-border text-muted px-3 py-1.5 rounded-lg hover:text-fg transition"
        >
          {sort === "impact" ? "⚡ By impact" : "↓ Newest"}
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

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg px-4 py-3 mb-6 text-sm text-red-400">
          Failed to load: {error}
          <button onClick={load} className="ml-3 underline">Retry</button>
        </div>
      )}

      {/* Claims */}
      {loading ? (
        <p className="text-muted text-center py-20">Loading...</p>
      ) : claims.length === 0 ? (
        <div className="text-center py-20 text-muted text-sm">
          <div className="text-3xl mb-3">🎉</div>
          {tab === "review"
            ? "Nothing awaiting your review — every claim has a verdict."
            : `No ${tab} claims right now.`}
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map((claim) => {
            const isEditing = editingId === claim.id;
            const justSaved = savedId === claim.id;
            return (
              <div key={claim.id} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {/* Status */}
                  <div className="flex flex-col items-center gap-1 mt-0.5">
                    <span
                      className={`text-xs border rounded-full px-2.5 py-1 whitespace-nowrap ${
                        CLAIM_COLORS[claim.status]
                      }`}
                      title={
                        claim.researchStatus === "done"
                          ? "Research completed"
                          : "Awaiting research"
                      }
                    >
                      {claim.status}
                    </span>
                    {impactBadge(claim.impactScore) && (
                      <span
                        className="text-xs"
                        title={`Impact ${claim.impactScore}/5`}
                      >
                        {impactBadge(claim.impactScore)}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-fg text-sm leading-relaxed">{claim.text}</p>

                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <Link
                        href={`/stocks/${claim.stock.ticker}`}
                        className="text-xs text-accent hover:underline font-medium"
                      >
                        ${claim.stock.ticker}
                      </Link>
                      {claim.insightType && (
                        <span className="text-[10px] text-muted/70 border border-border rounded-full px-2 py-0.5">
                          {claim.insightType}
                        </span>
                      )}
                      {claim.source && (
                        <span className="text-xs text-muted/70">{claim.source}</span>
                      )}
                      <span className="text-xs text-muted/50">
                        {new Date(claim.createdAt).toLocaleDateString()}
                      </span>
                      {justSaved && (
                        <span className="text-xs text-green-400">✅ saved</span>
                      )}
                    </div>

                    {/* Source tweet */}
                    {claim.tweet && (
                      <div className="mt-2 bg-bg rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted">Source tweet</span>
                          <Link href="/tweets" className="text-xs text-accent hover:underline">
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

                    {/* AI evidence (reference only) */}
                    {claim.evidence && !isEditing && (
                      <div className="mt-2">
                        <p className="text-fg/70 text-xs whitespace-pre-wrap bg-bg rounded-lg p-3 border border-border">
                          <span className="text-muted/70">🤖 AI research · </span>
                          {claim.evidence}
                        </p>
                      </div>
                    )}

                    {/* Human note (if any) */}
                    {claim.humanNote && !isEditing && (
                      <div className="mt-2">
                        <p className="text-fg/70 text-xs whitespace-pre-wrap bg-bg rounded-lg p-3 border border-accent/20">
                          <span className="text-muted/70">📝 Your note · </span>
                          {claim.humanNote}
                        </p>
                      </div>
                    )}

                    {/* Manual research editor */}
                    {isEditing ? (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="text-[10px] text-muted/70 block mb-1">
                            Your verdict
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {STATUS_OPTIONS.map((s) => (
                              <button
                                key={s}
                                onClick={() => setEditStatus(s)}
                                className={`text-xs px-3 py-1.5 rounded-full border capitalize transition ${
                                  editStatus === s
                                    ? "bg-accent text-bg border-accent"
                                    : "border-border text-muted hover:text-fg"
                                }`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea
                          value={editEvidence}
                          onChange={(e) => setEditEvidence(e.target.value)}
                          placeholder="Your research results — sources, numbers, reasoning. This becomes the claim's evidence."
                          rows={6}
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm resize-y"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveVerdict(claim.id)}
                            disabled={saving}
                            className="bg-accent text-bg px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save verdict"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="border border-border text-muted px-3 py-1.5 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(claim)}
                        className="mt-3 text-xs px-3 py-1.5 rounded border border-accent/30 text-accent hover:bg-accent/10 transition"
                      >
                        {claim.researchStatus === "done"
                          ? "✏️ Edit my research"
                          : "🔬 Research & enter verdict"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
