"use client";

import { useEffect, useMemo, useState } from "react";

interface Tweet {
  id: number;
  content: string;
  timestamp: string | null;
  claimCount: number;
  isInvesting: boolean | null;
  processedAt: string;
}

function dateLabel(ts: string | null): string {
  if (!ts) return "Unknown";
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const tweetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (tweetDay.getTime() === today.getTime()) return "Today";
  if (tweetDay.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TweetsPage() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [syncing, setSyncing] = useState(false);

  function refresh() {
    fetch("/api/tweets").then((r) => r.json()).then(setTweets);
  }

  useEffect(() => { refresh(); }, []);

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOkvJt78q-g8yiksB3gf80Cqsc-UGwFeFjEoA9Lfh_x5PZ69md0YS9MCrkVBP-tbVILYyKx_mFI1DZ/pub?gid=1420895083&single=true&output=csv",
      }),
    });
    setSyncing(false);
    refresh();
  }

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const grouped = useMemo(() => {
    const g: Record<string, Tweet[]> = {};
    for (const t of tweets) {
      const key = dateLabel(t.timestamp);
      (g[key] ||= []).push(t);
    }
    return g;
  }, [tweets]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fg">Tweets</h1>
          <p className="text-muted text-sm mt-1">{tweets.length} synced from Serenity</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-accent text-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {tweets.length === 0 ? (
        <p className="text-muted text-center py-20">No tweets synced yet.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([label, items]) => (
            <section key={label}>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 sticky top-14 bg-bg/80 backdrop-blur py-1 z-10">
                {label} ({items.length})
              </h2>
              <div className="space-y-2">
                {items.map((tweet) => {
                  const isLong = tweet.content.length > 200;
                  const showFull = expanded.has(tweet.id);
                  const display = isLong && !showFull ? tweet.content.slice(0, 200) + "..." : tweet.content;
                  return (
                    <div key={tweet.id} className="bg-surface border border-border rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        {tweet.timestamp && (
                          <span className="text-[10px] text-muted">
                            {new Date(tweet.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {tweet.claimCount > 0 && (
                          <span className="text-[10px] bg-accent/10 text-accent border border-accent/20 rounded-full px-2 py-0.5">
                            {tweet.claimCount} claim{tweet.claimCount !== 1 ? "s" : ""}
                          </span>
                        )}
                        {tweet.isInvesting === false && (
                          <span className="text-[10px] bg-muted/10 text-muted border border-border rounded-full px-2 py-0.5">non-investing</span>
                        )}
                      </div>
                      <p className="text-fg/80 text-xs whitespace-pre-wrap leading-relaxed">{display}</p>
                      {isLong && (
                        <button onClick={() => toggle(tweet.id)} className="text-[10px] text-accent mt-1 hover:underline">
                          {showFull ? "Show less" : `Show full (${tweet.content.length} chars)`}
                        </button>
                      )}
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
