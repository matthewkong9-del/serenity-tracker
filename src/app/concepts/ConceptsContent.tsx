"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TweetRef {
  id: number;
  content: string;
  timestamp: string | null;
}

interface Concept {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  _count: { tweets: number };
  tweets: { tweet: TweetRef }[];
}

interface CategoryInfo {
  name: string;
  count: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  Technology: "border-blue-400/30 bg-blue-400/10 text-blue-400",
  "Supply Chain": "border-purple-400/30 bg-purple-400/10 text-purple-400",
  "Market Theme": "border-green-400/30 bg-green-400/10 text-green-400",
  Product: "border-yellow-400/30 bg-yellow-400/10 text-yellow-400",
  Other: "border-zinc-400/30 bg-zinc-400/10 text-zinc-400",
};

function categoryColor(cat: string | null) {
  return CATEGORY_COLORS[cat || ""] || CATEGORY_COLORS["Other"];
}

export default function ConceptsContent() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);

    fetch(`/api/concepts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setConcepts(data.concepts);
        setCategories(data.categories);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [categoryFilter]);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBackfill() {
    setBackfilling(true);
    setBackfillMsg("Extracting concepts from existing tweets...");
    try {
      const res = await fetch("/api/backfill-concepts", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setBackfillMsg(
          `Done: ${data.extracted} tweets processed, ${data.totalConcepts} concept links created`
        );
        // Refresh the list
        setCategoryFilter("all");
        fetch("/api/concepts")
          .then((r) => r.json())
          .then((d) => {
            setConcepts(d.concepts);
            setCategories(d.categories);
          });
      } else {
        setBackfillMsg(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setBackfillMsg(`Error: ${e.message}`);
    }
    setBackfilling(false);
  }

  // Group concepts by category for display
  const grouped = new Map<string, Concept[]>();
  for (const c of concepts) {
    const key = c.category || "Uncategorized";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }

  const totalConcepts = concepts.length;
  const totalTweetLinks = concepts.reduce((sum, c) => sum + c._count.tweets, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fg">Concepts</h1>
        <p className="text-muted text-sm mt-1">
          {totalConcepts} concepts · {totalTweetLinks} tweet connections
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5 mb-8">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            categoryFilter === "all"
              ? "bg-accent text-bg border-accent"
              : "border-border text-muted hover:text-fg hover:border-muted"
          }`}
        >
          All ({totalConcepts})
        </button>
        {categories.map((cat) => (
          <button
            key={cat.name}
            onClick={() => setCategoryFilter(categoryFilter === cat.name ? "all" : cat.name)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              categoryFilter === cat.name
                ? "bg-accent text-bg border-accent"
                : "border-border text-muted hover:text-fg hover:border-muted"
            }`}
          >
            {cat.name} ({cat.count})
          </button>
        ))}
      </div>

      {/* Loading / empty */}
      {loading ? (
        <p className="text-muted text-center py-20">Loading...</p>
      ) : concepts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted text-lg mb-4">No concepts yet.</p>
          {backfillMsg ? (
            <p className="text-xs text-accent mb-4">{backfillMsg}</p>
          ) : (
            <p className="text-muted text-sm mb-6">
              Run backfill to extract concepts from {backfilling ? "..." : "existing tweets"}.
            </p>
          )}
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="bg-accent text-bg px-6 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50"
          >
            {backfilling ? "Extracting..." : "Extract Concepts from Tweets"}
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-xs text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${categoryColor(category).split(" ")[2]}`} />
                {category}
                <span className="text-muted/50">({items.length})</span>
              </h2>

              <div className="space-y-2">
                {items.map((concept) => (
                  <div
                    key={concept.id}
                    className="bg-surface border border-border rounded-xl transition"
                  >
                    {/* Concept header — clickable to expand */}
                    <button
                      onClick={() => toggle(concept.id)}
                      className="w-full text-left p-4 flex items-start justify-between"
                    >
                      <div className="min-w-0">
                        <span className="text-fg text-sm font-medium">{concept.name}</span>
                        {concept.description && (
                          <p className="text-muted text-xs mt-1 line-clamp-2">
                            {concept.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <span className="text-xs text-muted">
                          {concept._count.tweets} tweet
                          {concept._count.tweets !== 1 ? "s" : ""}
                        </span>
                        <span className="text-muted text-xs">
                          {expanded.has(concept.id) ? "▲" : "▼"}
                        </span>
                      </div>
                    </button>

                    {/* Expanded tweets */}
                    {expanded.has(concept.id) && (
                      <div className="border-t border-border px-4 py-3 space-y-2">
                        {concept.tweets.length === 0 ? (
                          <p className="text-muted text-xs">No tweets linked.</p>
                        ) : (
                          concept.tweets.map(({ tweet }) => (
                            <div
                              key={tweet.id}
                              className="bg-bg rounded-lg border border-border p-3"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                {tweet.timestamp && (
                                  <span className="text-xs text-muted">
                                    {new Date(tweet.timestamp).toLocaleDateString()}
                                  </span>
                                )}
                                <Link
                                  href={`/tweets`}
                                  className="text-xs text-accent hover:underline"
                                >
                                  all tweets
                                </Link>
                              </div>
                              {(() => {
                                const isLong = tweet.content.length > 300;
                                const display = isLong
                                  ? tweet.content.slice(0, 300) + "..."
                                  : tweet.content;
                                return (
                                  <p className="text-fg/70 text-xs whitespace-pre-wrap leading-relaxed">
                                    {display}
                                  </p>
                                );
                              })()}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
