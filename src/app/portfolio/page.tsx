"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { STANCE_COLORS } from "@/lib/db";

interface StockSummary {
  ticker: string;
  name: string | null;
  sector: string | null;
  stance: string | null;
  extractionError: string | null;
  claimCounts: { unverified: number; supported: number; refuted: number; disputed: number };
  fileCount: number;
  entryCount: number;
  lastSummaryAt: string | null;
  updatedAt: string;
}

interface PortfolioData {
  stocks: StockSummary[];
  totals: { stocks: number; claims: number; verifiedRate: string; stocksWithErrors: number };
}

interface RankedStock {
  ticker: string;
  urgency: number;
  reason: string;
}

interface DecisionSummary {
  ticker: string;
  maturity: string;
  action: string | null;
  reasoning: string;
}

const MATURITY_COLORS: Record<string, string> = {
  beginning: "border-slate-400/30 bg-slate-400/5",
  core: "border-amber-400/30 bg-amber-400/5",
  actionable: "border-emerald-400/30 bg-emerald-400/5",
};

const MATURITY_LABELS: Record<string, string> = {
  beginning: "🌱 Beginning",
  core: "🔬 Core",
  actionable: "🎯 Actionable",
};

const ACTION_COLORS: Record<string, string> = {
  buy: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  hold: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  sell: "text-red-400 border-red-400/30 bg-red-400/10",
};

const URGENCY_COLORS: Record<number, string> = {
  1: "text-slate-400",
  2: "text-slate-400",
  3: "text-slate-400",
  4: "text-amber-400",
  5: "text-amber-400",
  6: "text-amber-400",
  7: "text-orange-400",
  8: "text-red-400",
  9: "text-red-400",
  10: "text-red-400",
};

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [ranked, setRanked] = useState<RankedStock[]>([]);
  const [ranking, setRanking] = useState(false);

  // Decisions (maturity ladder)
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then(setData);
  }, []);

  async function handleRank() {
    setRanking(true);
    const body = sectorFilter ? JSON.stringify({ sector: sectorFilter }) : "{}";
    const res = await fetch("/api/portfolio/attention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    setRanking(false);

    if (res.ok) {
      const data = await res.json();
      setRanked(data.ranked || []);
    }
  }

  async function handleDecide() {
    setDeciding(true);
    const res = await fetch("/api/portfolio/decisions", { method: "POST" });
    setDeciding(false);

    if (res.ok) {
      const data = await res.json();
      setDecisions(data.decisions || []);
    }
  }

  if (!data) {
    return <div className="text-muted text-center py-20">Loading...</div>;
  }

  const sectors = Array.from(
    new Set(data.stocks.map((s) => s.sector).filter(Boolean))
  ) as string[];

  const filtered = sectorFilter
    ? data.stocks.filter((s) => s.sector === sectorFilter)
    : data.stocks;

  // Merge ranked data into stocks
  const urgencyMap = new Map(ranked.map((r) => [r.ticker, r]));

  // Merge decisions
  const decisionMap = new Map(decisions.map((d) => [d.ticker, d]));
  const maturityGroups = {
    beginning: decisions.filter((d) => d.maturity === "beginning"),
    core: decisions.filter((d) => d.maturity === "core"),
    actionable: decisions.filter((d) => d.maturity === "actionable"),
  };

  // Sort: ranked first, then by unverified count desc
  const sorted = [...filtered].sort((a, b) => {
    const aRank = urgencyMap.has(a.ticker) ? urgencyMap.get(a.ticker)!.urgency : 999;
    const bRank = urgencyMap.has(b.ticker) ? urgencyMap.get(b.ticker)!.urgency : 999;
    if (aRank !== bRank) return aRank - bRank;
    return b.claimCounts.unverified - a.claimCounts.unverified;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-fg">Portfolio</h1>
          <p className="text-muted text-sm mt-1">
            {data.totals.stocks} stocks · {data.totals.claims} claims ·{" "}
            {data.totals.verifiedRate} verified
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRank}
            disabled={ranking}
            className={`text-xs px-3 py-2 rounded-lg font-medium transition ${
              ranking
                ? "border border-border text-muted cursor-wait"
                : "border border-accent/30 text-accent hover:bg-accent/10"
            }`}
          >
            {ranking ? "Ranking..." : "Rank by Urgency"}
          </button>
          <button
            onClick={handleDecide}
            disabled={deciding}
            className={`text-xs px-3 py-2 rounded-lg font-medium transition ${
              deciding
                ? "border border-border text-muted cursor-wait"
                : "bg-accent text-bg hover:bg-accent/90"
            } disabled:opacity-50`}
          >
            {deciding ? "Generating..." : "Generate Decisions"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-fg">{data.totals.stocks}</p>
          <p className="text-xs text-muted">Stocks tracked</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-fg">{data.totals.claims}</p>
          <p className="text-xs text-muted">Total claims</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-accent">{data.totals.verifiedRate}</p>
          <p className="text-xs text-muted">Verified</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-red-400">{data.totals.stocksWithErrors}</p>
          <p className="text-xs text-muted">With errors</p>
        </div>
      </div>

      {/* Maturity Ladder (when decisions exist) */}
      {decisions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-fg mb-4">Maturity Ladder</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["beginning", "core", "actionable"] as const).map((m) => (
              <div
                key={m}
                className={`border rounded-xl p-4 ${MATURITY_COLORS[m]}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs uppercase tracking-wider text-muted font-semibold">
                    {MATURITY_LABELS[m]}
                  </h3>
                  <span className="text-xs text-muted">
                    {maturityGroups[m].length}
                  </span>
                </div>
                {maturityGroups[m].length === 0 ? (
                  <p className="text-muted text-xs">None</p>
                ) : (
                  <div className="space-y-2">
                    {maturityGroups[m].map((d) => {
                      const stock = data.stocks.find((s) => s.ticker === d.ticker);
                      return (
                        <Link
                          key={d.ticker}
                          href={`/stocks/${d.ticker}`}
                          className="block bg-bg border border-border rounded-lg p-3 hover:border-accent/30 transition"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-fg text-sm font-medium">
                              ${d.ticker}
                            </span>
                            {d.action && (
                              <span
                                className={`text-xs border rounded-full px-2 py-0.5 ${
                                  ACTION_COLORS[d.action] || ""
                                }`}
                              >
                                {d.action.toUpperCase()}
                              </span>
                            )}
                          </div>
                          {stock?.name && (
                            <p className="text-muted text-xs mt-0.5">{stock.name}</p>
                          )}
                          <p className="text-muted/70 text-xs mt-1 line-clamp-2">
                            {d.reasoning}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sector filter */}
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
              onClick={() =>
                setSectorFilter(sectorFilter === sector ? null : sector)
              }
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

      {/* Stock list */}
      {sorted.length === 0 ? (
        <p className="text-muted text-center py-20">No stocks match this filter.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((stock) => {
            const rank = urgencyMap.get(stock.ticker);
            return (
              <Link
                key={stock.ticker}
                href={`/stocks/${stock.ticker}`}
                className="block bg-surface border border-border rounded-xl p-4 hover:border-accent/40 transition group"
              >
                <div className="flex items-center gap-4">
                  {/* Urgency badge */}
                  {rank && (
                    <span
                      className={`text-lg font-bold min-w-[2rem] text-center ${
                        URGENCY_COLORS[rank.urgency] || "text-muted"
                      }`}
                      title={rank.reason}
                    >
                      {rank.urgency}
                    </span>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-fg font-semibold group-hover:text-accent transition">
                        ${stock.ticker}
                      </span>
                      {stock.stance && (
                        <span
                          className={`text-xs border rounded-full px-2 py-0.5 ${
                            STANCE_COLORS[stock.stance as keyof typeof STANCE_COLORS] || ""
                          }`}
                        >
                          {stock.stance}
                        </span>
                      )}
                      {stock.sector && (
                        <span className="text-xs bg-bg border border-border rounded-full px-2 py-0.5 text-muted">
                          {stock.sector}
                        </span>
                      )}
                      {stock.extractionError && (
                        <span className="text-xs text-red-400">⚠️ Error</span>
                      )}
                    </div>
                    {stock.name && (
                      <p className="text-muted text-xs mt-0.5">{stock.name}</p>
                    )}
                    {rank && (
                      <p className="text-muted/60 text-xs mt-1 italic line-clamp-1">
                        {rank.reason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted shrink-0">
                    <span
                      className={
                        stock.claimCounts.unverified > 0
                          ? "text-amber-400"
                          : "text-muted"
                      }
                    >
                      {stock.claimCounts.unverified} unverified
                    </span>
                    <span>{stock.claimCounts.supported} supported</span>
                    <span>{stock.claimCounts.refuted} refuted</span>
                    <span>{stock.fileCount} files</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
