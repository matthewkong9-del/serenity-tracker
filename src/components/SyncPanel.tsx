"use client";

import { useState } from "react";

const DEFAULT_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOkvJt78q-g8yiksB3gf80Cqsc-UGwFeFjEoA9Lfh_x5PZ69md0YS9MCrkVBP-tbVILYyKx_mFI1DZ/pub?gid=1420895083&single=true&output=csv";

interface SyncResult {
  newTweets: number;
  skippedTweets: number;
  totalClaims: number;
  newStocks: string[];
}

interface SyncPanelProps {
  onSyncComplete?: () => void;
}

export default function SyncPanel({ onSyncComplete }: SyncPanelProps) {
  const [csvUrl, setCsvUrl] = useState(DEFAULT_CSV_URL);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg("Syncing...");
    setSyncResult(null);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSyncMsg(`Error: ${data.error}`);
      } else {
        setSyncResult(data);
        setSyncMsg("");
        onSyncComplete?.();
      }
    } catch (e: any) {
      setSyncMsg(`Error: ${e.message}`);
    }

    setSyncing(false);
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 mb-6">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted uppercase tracking-wider whitespace-nowrap">
          Tweet Sync
        </span>
        <input
          type="text"
          value={csvUrl}
          onChange={(e) => setCsvUrl(e.target.value)}
          placeholder="Google Sheets CSV URL"
          className="flex-1 bg-bg border border-border rounded-lg px-3 py-1.5 text-xs text-fg placeholder:text-muted/50 font-mono"
        />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-accent text-bg px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/90 transition disabled:opacity-50 whitespace-nowrap"
        >
          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>
      {syncMsg && <p className="text-xs text-muted mt-2">{syncMsg}</p>}
      {syncResult && (
        <div className="mt-3 border-t border-border pt-3 flex gap-4 text-xs">
          <span className="text-accent">{syncResult.newTweets} new tweets</span>
          <span className="text-muted">{syncResult.skippedTweets} skipped</span>
          <span className="text-accent">{syncResult.totalClaims} claims extracted</span>
          {syncResult.newStocks.length > 0 && (
            <span className="text-muted">
              New stocks: {syncResult.newStocks.map((s) => `$${s}`).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
