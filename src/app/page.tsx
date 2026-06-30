"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseStance, STANCE_COLORS } from "@/lib/db";

interface Stock {
  id: number;
  ticker: string;
  name: string | null;
  sector: string | null;
  summary: string | null;
  updatedAt: string;
  _count: { files: number; notes: number; claims: number };
}

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [summarizingAll, setSummarizingAll] = useState(false);
  const [summarizeResult, setSummarizeResult] = useState<string | null>(null);

  // Sync state
  const [csvUrl, setCsvUrl] = useState(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOkvJt78q-g8yiksB3gf80Cqsc-UGwFeFjEoA9Lfh_x5PZ69md0YS9MCrkVBP-tbVILYyKx_mFI1DZ/pub?gid=1420895083&single=true&output=csv"
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncResult, setSyncResult] = useState<{
    newTweets: number;
    skippedTweets: number;
    totalClaims: number;
    newStocks: string[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/stocks")
      .then((r) => r.json())
      .then(setStocks);
  }, []);

  const sectors = Array.from(new Set(stocks.map((s) => s.sector).filter(Boolean))) as string[];

  const filtered = stocks.filter(
    (s) =>
      (s.ticker.toLowerCase().includes(search.toLowerCase()) ||
        (s.name && s.name.toLowerCase().includes(search.toLowerCase())) ||
        (s.sector && s.sector.toLowerCase().includes(search.toLowerCase()))) &&
      (!sectorFilter || s.sector === sectorFilter)
  );

  async function handleSummarizeAll() {
    setSummarizingAll(true);
    setSummarizeResult(null);
    const res = await fetch("/api/summarize-all", { method: "POST" });
    const data = await res.json();
    setSummarizingAll(false);
    if (data.summarized > 0 || data.failed > 0) {
      setSummarizeResult(
        `Updated ${data.summarized} stock${data.summarized !== 1 ? "s" : ""}${data.failed > 0 ? `, ${data.failed} failed` : ""}`
      );
      // Refresh stock list to show new stances
      fetch("/api/stocks")
        .then((r) => r.json())
        .then(setStocks);
    } else {
      setSummarizeResult(data.message || "Done");
    }
    setTimeout(() => setSummarizeResult(null), 4000);
  }

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
        // Refresh stock list
        fetch("/api/stocks")
          .then((r) => r.json())
          .then(setStocks);
      }
    } catch (e: any) {
      setSyncMsg(`Error: ${e.message}`);
    }

    setSyncing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-fg">Stocks</h1>
          <p className="text-muted text-sm mt-1">{stocks.length} tracked</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSummarizeAll}
            disabled={summarizingAll}
            className="text-xs border border-border text-muted px-3 py-2 rounded-lg hover:text-accent hover:border-accent/30 transition disabled:opacity-50 whitespace-nowrap"
          >
            {summarizingAll ? "Summarizing..." : "Refresh All"}
          </button>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface border border-border rounded-lg px-4 py-2 text-sm text-fg w-64 placeholder:text-muted"
          />
        </div>
      </div>
      {summarizeResult && <p className="text-xs text-accent mb-4 -mt-4">{summarizeResult}</p>}

      {/* Sync Panel */}
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

      {sectors.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSectorFilter(null)}
            className={`text-xs px-3 py-1 rounded-full border transition ${
              sectorFilter === null
                ? "bg-accent text-bg border-accent"
                : "border-border text-muted hover:text-fg hover:border-muted"
            }`}
          >
            All
          </button>
          {sectors.map((sector) => (
            <button
              key={sector}
              onClick={() => setSectorFilter(sectorFilter === sector ? null : sector)}
              className={`text-xs px-3 py-1 rounded-full border transition ${
                sectorFilter === sector
                  ? "bg-accent text-bg border-accent"
                  : "border-border text-muted hover:text-fg hover:border-muted"
              }`}
            >
              {sector}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted text-lg mb-4">
            {stocks.length === 0 ? "No stocks yet" : "No matches found"}
          </p>
          <Link
            href="/stocks/new"
            className="inline-block bg-accent text-bg px-6 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition"
          >
            Add your first stock
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((stock) => {
            const stance = parseStance(stock.summary);
            return (
              <Link
                key={stock.id}
                href={`/stocks/${stock.ticker}`}
                className="block bg-surface border border-border rounded-xl p-5 hover:border-accent/40 transition group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-fg group-hover:text-accent transition">
                      ${stock.ticker}
                    </h2>
                    {stock.name && <p className="text-muted text-sm mt-0.5">{stock.name}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {stance && (
                      <span
                        className={`text-xs border rounded-full px-2.5 py-0.5 ${STANCE_COLORS[stance]}`}
                      >
                        {stance}
                      </span>
                    )}
                    {stock.sector && (
                      <span className="text-xs bg-bg border border-border rounded-full px-2.5 py-0.5 text-muted">
                        {stock.sector}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 mt-4 text-xs text-muted">
                  <span>{stock._count.claims} claims</span>
                  <span>{stock._count.files} files</span>
                  <span>{stock._count.notes} notes</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
