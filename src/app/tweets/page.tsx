"use client";

import { useEffect, useState } from "react";

interface Tweet {
  id: number;
  content: string;
  timestamp: string | null;
  claimCount: number;
  processedAt: string;
}

export default function TweetsPage() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/tweets")
      .then((r) => r.json())
      .then(setTweets);
  }, []);

  const filtered = tweets.filter((t) =>
    t.content.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-fg">Tweets</h1>
          <p className="text-muted text-sm mt-1">
            {tweets.length} synced from Serenity
          </p>
        </div>
        <input
          type="text"
          placeholder="Search tweets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface border border-border rounded-lg px-4 py-2 text-sm text-fg w-64 placeholder:text-muted"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted text-center py-20">
          {tweets.length === 0 ? "No tweets synced yet." : "No matches."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((tweet) => {
            const isLong = tweet.content.length > 400;
            const showFull = expanded.has(tweet.id);
            const displayContent =
              isLong && !showFull
                ? tweet.content.slice(0, 400) + "..."
                : tweet.content;

            return (
              <div
                key={tweet.id}
                className="bg-surface border border-border rounded-xl p-5"
              >
                <div className="flex items-center gap-3 mb-2">
                  {tweet.timestamp && (
                    <span className="text-xs text-muted">
                      {new Date(tweet.timestamp).toLocaleString()}
                    </span>
                  )}
                  {tweet.claimCount > 0 && (
                    <a
                      href={`/claims?tweetId=${tweet.id}`}
                      className="text-xs bg-accent/10 text-accent border border-accent/20 rounded-full px-2 py-0.5 hover:bg-accent/20 transition"
                    >
                      {tweet.claimCount} claim{tweet.claimCount !== 1 ? "s" : ""} →
                    </a>
                  )}
                </div>
                <p className="text-fg/80 text-sm whitespace-pre-wrap leading-relaxed">
                  {displayContent}
                </p>
                {isLong && (
                  <button
                    onClick={() => toggle(tweet.id)}
                    className="text-xs text-accent mt-2 hover:underline"
                  >
                    {showFull ? "Show less" : `Show full tweet (${tweet.content.length.toLocaleString()} chars)`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
