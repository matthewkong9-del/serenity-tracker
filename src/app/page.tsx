"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { STANCE_COLORS } from "@/lib/db";
import { BUCKET_COLORS, BUCKET_LABELS, type OpportunityBucket } from "@/lib/scoring";

interface StockCard {
  id: number;
  ticker: string;
  name: string | null;
  sector: string | null;
  summary: string | null;
  currentPrice: number | null;
  pbRatio: number | null;
  lastPriceUpdated: string | null;
  updatedAt: string;
  stance: string | null;
  bucket: OpportunityBucket;
  claimCounts: { supported: number; refuted: number; disputed: number; unverified: number };
  _count: { files: number; notes: number; claims: number };
}

const BUCKET_ORDER: OpportunityBucket[] = ["strong_buy", "watch", "pass"];

export default function Home() {
  const [stocks, setStocks] = useState<StockCard[]>([]);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [costs, setCosts] = useState<any>(null);
  const [showCosts, setShowCosts] = useState(false);

  useEffect(() => {
    fetch("/api/stocks")
      .then((r) => r.json())
      .then(setStocks);
    fetch("/api/costs")
      .then((r) => r.json())
      .then(setCosts);
  }, []);

  async function refreshPrices() {
    setRefreshingPrices(true);
    await fetch("/api/prices/refresh", { method: "POST" });
    const r = await fetch("/api/stocks");
    setStocks(await r.json());
    setRefreshingPrices(false);
  }

  // Normalize and group sectors — only show groups with 2+ stocks
  const sectors = useMemo(() => {
    const parentMap: Record<string, string> = {
      "Semiconductors": "Semiconductors",
      "Semiconductor": "Semiconductors",
      "Semiconductors (Foundry)": "Semiconductors",
      "Semiconductors (Memory)": "Semiconductors",
      "Semiconductor Equipment": "Semiconductor Equipment",
      "Optical Components": "Optical / Photonics",
      "Photonics / Optical Components": "Optical / Photonics",
      "Electronic Components": "Electronic Components",
      "Electrical Equipment": "Electrical Equipment",
      "Software": "Software / Cloud",
      "Software / Cloud": "Software / Cloud",
      "IT Services": "Software / Cloud",
      "Data Center / Bitcoin Mining": "Data Center / Mining",
      "Industrial Robotics": "Industrial / Robotics",
      "Automotive": "Automotive",
      "ETF": "ETF",
      "Energy": "Energy",
      "Financial Services": "Financial Services",
      "Technology": "Technology",
      "Social Media": "Social Media",
    };
    const groups: Record<string, number> = {};
    for (const s of stocks) {
      if (!s.sector) continue;
      const parent = parentMap[s.sector] || s.sector;
      groups[parent] = (groups[parent] || 0) + 1;
    }
    // Only show sectors with 2+ stocks, sorted by count descending
    return Object.entries(groups)
      .filter(([, count]) => count >= 2)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name);
  }, [stocks]);

  // Map each stock's sector to its parent for filtering
  const parentSector = (s: StockCard): string | null => {
    if (!s.sector) return null;
    const parentMap: Record<string, string> = {
      "Semiconductors": "Semiconductors",
      "Semiconductor": "Semiconductors",
      "Semiconductors (Foundry)": "Semiconductors",
      "Semiconductors (Memory)": "Semiconductors",
      "Optical Components": "Optical / Photonics",
      "Photonics / Optical Components": "Optical / Photonics",
      "Software": "Software / Cloud",
      "Software / Cloud": "Software / Cloud",
      "IT Services": "Software / Cloud",
      "Data Center / Bitcoin Mining": "Data Center / Mining",
      "Industrial Robotics": "Industrial / Robotics",
    };
    return parentMap[s.sector] || s.sector;
  };

  const filtered = useMemo(
    () =>
      sectorFilter
        ? stocks.filter((s) => parentSector(s) === sectorFilter)
        : stocks,
    [stocks, sectorFilter]
  );

  const grouped = useMemo(() => {
    const g: Record<OpportunityBucket, StockCard[]> = {
      strong_buy: [],
      watch: [],
      pass: [],
    };
    for (const s of filtered) {
      g[s.bucket].push(s);
    }
    return g;
  }, [filtered]);

  const lastPriceUpdate =
    stocks.length > 0
      ? stocks.reduce((latest, s) => {
          if (!s.lastPriceUpdated) return latest;
          return s.lastPriceUpdated > latest ? s.lastPriceUpdated : latest;
        }, "")
      : null;

  function formatPrice(p: number | null): string {
    if (p == null) return "—";
    return `$${p.toFixed(2)}`;
  }

  function formatPb(pb: number | null): string {
    if (pb == null) return "—";
    return pb.toFixed(1);
  }

  function verificationRate(cc: StockCard["claimCounts"]): number | null {
    const resolved = cc.supported + cc.refuted;
    if (resolved === 0) return null;
    return Math.round((cc.supported / resolved) * 100);
  }

  function timeAgo(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-fg">Dashboard</h1>
          <p className="text-muted text-sm mt-1">
            {stocks.length} stocks tracked
            {lastPriceUpdate && <> · prices updated {timeAgo(lastPriceUpdate)}</>}
          </p>
        </div>
        <button
          onClick={refreshPrices}
          disabled={refreshingPrices}
          className="text-xs border border-border text-muted px-3 py-2 rounded-lg hover:text-accent hover:border-accent/30 transition disabled:opacity-50"
        >
          {refreshingPrices ? "Refreshing..." : "Refresh Prices"}
        </button>
      </div>

      {/* Running costs — collapsible */}
      {costs && (
        <div className="mb-4">
          <button
            onClick={() => setShowCosts(!showCosts)}
            className="flex items-center gap-2 text-xs text-muted hover:text-fg transition"
          >
            <span>💰 Running costs</span>
            <span className="font-mono text-[11px]">
              Today: {costs.today.calls} calls · ${costs.today.cost.toFixed(4)}
            </span>
            <span>{showCosts ? "▾" : "▸"}</span>
          </button>
          {showCosts && (
            <div className="mt-2 bg-surface border border-border rounded-xl p-4 text-xs space-y-2">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-muted">Today</p>
                  <p className="text-fg font-mono">{costs.today.calls} calls · ${costs.today.cost.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-muted">This month</p>
                  <p className="text-fg font-mono">{costs.month.calls} calls · ${costs.month.cost.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-muted">All time</p>
                  <p className="text-fg font-mono">{costs.allTime.calls} calls · ${costs.allTime.cost.toFixed(4)}</p>
                </div>
              </div>
              {Object.keys(costs.byPurpose).length > 0 && (
                <div className="border-t border-border pt-2">
                  <p className="text-muted mb-1">Today by purpose:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(costs.byPurpose).map(([purpose, info]: any) => (
                      <span key={purpose} className="bg-bg border border-border rounded px-2 py-0.5 text-fg/70">
                        {purpose}: {info.count} × ${info.cost.toFixed(4)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="border-t border-border pt-2 flex items-center gap-4">
                <span className="text-muted">
                  Brave API: {costs.braveToday} / 2,000 free today
                </span>
                {costs.pending.unverifiedClaims > 0 && (
                  <span className="text-amber-400">
                    ⏳ {costs.pending.unverifiedClaims} claims pending · ~${costs.pending.estimatedCost} to research
                  </span>
                )}
              </div>
            </div>
          )}
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
          {sectors.map((sec) => (
            <button
              key={sec}
              onClick={() => setSectorFilter(sectorFilter === sec ? null : sec)}
              className={`text-xs px-3 py-1 rounded-full border transition ${
                sectorFilter === sec
                  ? "bg-accent text-bg border-accent"
                  : "border-border text-muted hover:text-fg hover:border-muted"
              }`}
            >
              {sec}
            </button>
          ))}
        </div>
      )}

      {/* Bucket sections */}
      {stocks.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted text-lg mb-4">No stocks yet</p>
          <Link
            href="/stocks/new"
            className="inline-block bg-accent text-bg px-6 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition"
          >
            Add your first stock
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {BUCKET_ORDER.map((bucket) => {
            const items = grouped[bucket];
            if (items.length === 0) return null;

            // Pass section: collapsible
            const isCollapsed = bucket === "pass" && !showPass;

            return (
              <section key={bucket}>
                <button
                  onClick={() => bucket === "pass" && setShowPass(!showPass)}
                  className="flex items-center gap-2 mb-3 text-left w-full"
                >
                  <h2
                    className={`text-sm font-semibold uppercase tracking-wider ${
                      bucket === "strong_buy"
                        ? "text-green-400"
                        : bucket === "watch"
                          ? "text-amber-400"
                          : "text-muted"
                    }`}
                  >
                    {BUCKET_LABELS[bucket]}
                  </h2>
                  <span className="text-xs text-muted">({items.length})</span>
                  {bucket === "pass" && (
                    <span className="text-xs text-muted">
                      {isCollapsed ? "— show all ▸" : "— hide ▾"}
                    </span>
                  )}
                </button>

                {!isCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map((stock) => {
                      const vRate = verificationRate(stock.claimCounts);
                      return (
                        <Link
                          key={stock.id}
                          href={`/stocks/${stock.ticker}`}
                          className="block bg-surface border border-border rounded-xl p-4 hover:border-accent/40 transition group"
                        >
                          {/* Row 1: ticker + price */}
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-bold text-fg group-hover:text-accent transition">
                              ${stock.ticker}
                            </span>
                            <span className="text-sm text-fg font-mono">
                              {formatPrice(stock.currentPrice)}
                            </span>
                          </div>

                          {/* Name */}
                          {stock.name && (
                            <p className="text-muted text-xs mt-0.5 truncate">{stock.name}</p>
                          )}

                          {/* Row 2: P/B + stance + claims */}
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted">
                            <span>P/B {formatPb(stock.pbRatio)}</span>
                            {stock.stance && (
                              <span
                                className={`text-xs border rounded-full px-2 py-0.5 whitespace-nowrap ${STANCE_COLORS[stock.stance as keyof typeof STANCE_COLORS] || ""}`}
                              >
                                {stock.stance}
                              </span>
                            )}
                            <span>{stock._count.claims} claims</span>
                          </div>

                          {/* Row 3: verification % + last tweet */}
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                            {vRate !== null ? (
                              <span>{vRate}% verified</span>
                            ) : (
                              <span>pending</span>
                            )}
                            <span>· updated {timeAgo(stock.updatedAt)}</span>
                          </div>

                          {/* Bucket badge */}
                          <div className="mt-2 flex justify-end">
                            <span
                              className={`text-[10px] border rounded-full px-2.5 py-0.5 ${BUCKET_COLORS[bucket]}`}
                            >
                              {BUCKET_LABELS[bucket]}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
