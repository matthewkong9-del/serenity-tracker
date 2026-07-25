"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseStance, STANCE_COLORS, timeAgo } from "@/lib/db";
import { BUCKET_COLORS, BUCKET_LABELS, type OpportunityBucket } from "@/lib/scoring";

// ── Types ──

interface StockCard {
  id: number;
  ticker: string;
  name: string | null;
  sector: string | null;
  summary: string | null;
  narrative: string | null;
  currentPrice: number | null;
  pbRatio: number | null;
  marketCap: number | null;
  chokepointDepth: number | null;
  lastSummaryAt: string | null;
  updatedAt: string;
  stance: string | null;
  bucket: OpportunityBucket;
  claimCounts: { supported: number; refuted: number; disputed: number; unverified: number };
  _count: { files: number; notes: number; claims: number };
}

const BUCKET_ORDER: Record<OpportunityBucket, number> = {
  strong_buy: 0,
  watch: 1,
  pass: 2,
};

// ── Helpers ──

/** Extract the first meaningful sentence as a one-line thesis. */
function oneLineThesis(text: string | null): string | null {
  if (!text) return null;
  // Split into lines and filter out headers, bold markers, blank lines
  const lines = text.split("\n").filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("#") && !t.startsWith("**") && !t.startsWith("- ") && t.length > 20;
  });
  for (const line of lines) {
    // Strip residual markdown
    const cleaned = line.replace(/\*\*/g, "").replace(/\[|\]\(.*?\)/g, "").trim();
    if (cleaned.length > 40 && cleaned.length < 200) return cleaned;
    if (cleaned.length >= 200) return cleaned.slice(0, 180) + "…";
  }
  return null;
}

function formatMcap(m: number | null): string {
  if (!m) return "";
  if (m >= 1e12) return `$${(m / 1e12).toFixed(1)}T`;
  if (m >= 1e9) return `$${(m / 1e9).toFixed(1)}B`;
  if (m >= 1e6) return `$${(m / 1e6).toFixed(0)}M`;
  return `$${m.toFixed(0)}`;
}

// ── Parent sector normalization ──

const PARENT_SECTOR: Record<string, string> = {
  "Semiconductors": "Semiconductors",
  "Semiconductor": "Semiconductors",
  "Semiconductors (Foundry)": "Semiconductors",
  "Semiconductors (Memory)": "Semiconductors",
  "Semiconductors (Power/SiC)": "Semiconductors",
  "Semiconductors (IP)": "Semiconductors",
  "Semiconductors (Connectivity)": "Semiconductors",
  "Semiconductors (Epiwafers)": "Semiconductors",
  "Semiconductors (Substrates)": "Semiconductors",
  "Semiconductors / AI": "Semiconductors",
  "Semiconductors / Electronics": "Semiconductors",
  "AI Infrastructure / Semiconductors": "Semiconductors",
  "Compound Semiconductor Foundry": "Semiconductors",
  "Memory ICs": "Semiconductors",
  "NAND Controllers": "Semiconductors",
  "Semiconductor Equipment": "Semiconductor Equipment",
  "Semiconductor Equipment (Test)": "Semiconductor Equipment",
  "Semiconductor Equipment (Test/Burn-in)": "Semiconductor Equipment",
  "Semiconductor Equipment (MBE)": "Semiconductor Equipment",
  "Laser / Semiconductor Equipment": "Semiconductor Equipment",
  "Optical Components": "Optical / Photonics",
  "Photonics / Optical Components": "Optical / Photonics",
  "Photonics": "Optical / Photonics",
  "Semiconductor Packaging": "Semiconductor Packaging",
  "Semiconductor Packaging & Testing": "Semiconductor Packaging & Testing",
  "IC Packaging Substrates": "Semiconductor Packaging",
  "Semiconductor Materials": "Semiconductor Materials",
  "Semiconductor Wafers": "Semiconductor Wafers",
  "Electronic Components": "Electronic Components",
  "Electronic Components (MLCC)": "Electronic Components",
  "Passive Components": "Electronic Components",
  "Electronics ODM": "Electronic Components",
  "Electronics Manufacturing Services": "Electronic Components",
  "Electrical Equipment": "Electrical Equipment",
  "Power Electronics": "Electrical Equipment",
  "Software": "Software / Cloud",
  "Software / Cloud": "Software / Cloud",
  "IT Services": "Software / Cloud",
  "Data Center / Bitcoin Mining": "Data Center / Mining",
  "Data Center Infrastructure": "Data Center / Mining",
  "Data Center / AI Infrastructure": "Data Center / Mining",
  "Data Center / AI Cloud": "Data Center / Mining",
  "AI Infrastructure / Data Center": "Data Center / Mining",
  "Cloud / AI Infrastructure": "Data Center / Mining",
  "Bitcoin Mining": "Data Center / Mining",
  "Server ODM": "Data Center / Mining",
  "Industrial Robotics": "Industrial / Robotics",
  "Precision Motion Control / Robotics": "Industrial / Robotics",
  "Automotive": "Automotive",
  "Automotive LiDAR": "Automotive",
  "ETF": "ETF",
  "Energy": "Energy",
  "Financial Services": "Financial Services",
  "Technology": "Technology",
  "Internet / Technology": "Technology",
  "Artificial Intelligence": "Technology",
  "Social Media": "Social Media",
  "Private / Pre-IPO": "Private / Pre-IPO",
  "Aerospace": "Aerospace",
  "Networking": "Networking",
  "Wire/Cable & Optical": "Networking",
  "PCB Manufacturing": "PCB Manufacturing",
  "CCL Manufacturing": "CCL Manufacturing",
};

function parentSector(sector: string | null): string {
  if (!sector) return "Other";
  return PARENT_SECTOR[sector] || sector;
}

// ── Page ──

export default function KnowledgeBaseIndex() {
  const [stocks, setStocks] = useState<StockCard[]>([]);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stocks")
      .then((r) => r.json())
      .then((data) => {
        // Compute stance from summary
        setStocks(
          data.map((s: any) => ({
            ...s,
            stance: parseStance(s.summary),
          }))
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // ── Filter & sort ──
  const sectors = Array.from(
    new Set(stocks.map((s) => parentSector(s.sector)).filter(Boolean))
  ).sort();

  const filtered = stocks
    .filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          s.ticker.toLowerCase().includes(q) ||
          (s.name && s.name.toLowerCase().includes(q)) ||
          (s.summary && s.summary.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (sectorFilter && parentSector(s.sector) !== sectorFilter) return false;
      return true;
    })
    .sort((a, b) => {
      // Strong Buy first, then Watch, then Pass
      const bucketDiff = (BUCKET_ORDER[a.bucket] ?? 3) - (BUCKET_ORDER[b.bucket] ?? 3);
      if (bucketDiff !== 0) return bucketDiff;
      // Within same bucket: by chokepoint depth (higher first)
      const cdA = a.chokepointDepth ?? 0;
      const cdB = b.chokepointDepth ?? 0;
      if (cdB !== cdA) return cdB - cdA;
      // Then by last update (newer first)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  // ── Stats ──
  const stats = {
    total: stocks.length,
    strongBuy: stocks.filter((s) => s.bucket === "strong_buy").length,
    watch: stocks.filter((s) => s.bucket === "watch").length,
    pending: stocks.reduce((sum, s) => sum + s.claimCounts.unverified, 0),
  };

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fg mb-1">Knowledge Base</h1>
        <p className="text-sm text-muted">
          {stats.total} companies tracked · {stats.strongBuy} strong buys ·{" "}
          {stats.watch} on watch · {stats.pending} claims need research
        </p>

        {/* Quick nav links */}
        <div className="flex items-center gap-3 mt-3">
          <Link
            href="/tweets"
            className="text-[10px] text-muted hover:text-fg border border-border rounded-full px-2 py-1 transition"
          >
            📜 Tweet archive
          </Link>
          <Link
            href="/claims"
            className="text-[10px] text-muted hover:text-fg border border-border rounded-full px-2 py-1 transition"
          >
            🔍 Claims database
          </Link>
          <Link
            href="/log"
            className="text-[10px] text-muted hover:text-fg border border-border rounded-full px-2 py-1 transition"
          >
            💰 Cost log
          </Link>
          <Link
            href="/cleanup"
            className="text-[10px] text-muted hover:text-fg border border-border rounded-full px-2 py-1 transition"
          >
            🧹 Cleanup
          </Link>
        </div>
      </div>

      {/* ── Search & Filters ── */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ticker, name, or thesis..."
          className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs text-fg placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition"
        />
        <select
          value={sectorFilter || ""}
          onChange={(e) => setSectorFilter(e.target.value || null)}
          className="bg-bg border border-border rounded-lg px-3 py-2 text-xs text-fg focus:outline-none focus:border-accent/50 transition"
        >
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* ── Loader ── */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-xl p-5 animate-pulse"
            >
              <div className="h-4 bg-bg rounded w-32 mb-3" />
              <div className="h-3 bg-bg rounded w-full mb-2" />
              <div className="h-3 bg-bg rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* ── Stock Cards ── */}
      {!loading && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted text-sm">
              {search || sectorFilter
                ? "No stocks match your filters."
                : "No stocks yet. Sync tweets to get started."}
            </div>
          )}

          {filtered.map((stock) => {
            const thesis = oneLineThesis(stock.narrative || stock.summary);
            const unresolved = stock.claimCounts.unverified;
            const verified = stock.claimCounts.supported;
            const resolved =
              verified + stock.claimCounts.refuted + stock.claimCounts.disputed;
            const total = stock._count.claims;
            const verificationPct =
              total > 0 ? Math.round((resolved / total) * 100) : 0;

            return (
              <Link
                key={stock.ticker}
                href={`/stocks/${stock.ticker}`}
                className="block bg-surface border border-border rounded-xl p-5 hover:border-accent/30 hover:bg-bg/50 transition group"
              >
                <div className="flex items-start gap-4">
                  {/* Left: ticker + badges */}
                  <div className="flex-shrink-0 w-28">
                    <div className="text-base font-bold text-fg group-hover:text-accent transition">
                      ${stock.ticker}
                    </div>
                    {stock.name && (
                      <div className="text-[11px] text-muted truncate mt-0.5">
                        {stock.name}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <span
                        className={`text-[10px] border rounded-full px-1.5 py-0.5 ${
                          BUCKET_COLORS[stock.bucket]
                        }`}
                      >
                        {BUCKET_LABELS[stock.bucket]}
                      </span>
                      {stock.stance && (
                        <span
                          className={`text-[10px] border rounded-full px-1.5 py-0.5 ${
                            (STANCE_COLORS as any)[stock.stance] || ""
                          }`}
                        >
                          {stock.stance}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Center: thesis */}
                  <div className="flex-1 min-w-0">
                    {thesis ? (
                      <p className="text-sm text-fg/80 leading-relaxed line-clamp-2">
                        {thesis}
                      </p>
                    ) : (
                      <p className="text-sm text-muted/50 italic">
                        No summary yet — run analysis to generate thesis.
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {stock.chokepointDepth && (
                        <span className="text-[10px] text-accent">
                          🔗 Chokepoint {stock.chokepointDepth}/5
                        </span>
                      )}
                      {total > 0 && (
                        <span className="text-[10px] text-muted">
                          {verified} verified · {verificationPct}% resolved
                          {unresolved > 0 && (
                            <span className="text-amber-400 ml-1">
                              · {unresolved} pending
                            </span>
                          )}
                        </span>
                      )}
                      {stock.sector && (
                        <span className="text-[10px] text-muted/50 border border-border rounded-full px-1.5 py-0.5">
                          {stock.sector}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: price + docs */}
                  <div className="flex-shrink-0 text-right">
                    {stock.currentPrice ? (
                      <>
                        <div className="text-sm font-medium text-fg">
                          ${stock.currentPrice.toFixed(2)}
                        </div>
                        {stock.pbRatio && (
                          <div className="text-[10px] text-muted">
                            {stock.pbRatio.toFixed(1)}x P/B
                          </div>
                        )}
                        {stock.marketCap && (
                          <div className="text-[10px] text-muted/50">
                            {formatMcap(stock.marketCap)}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[10px] text-muted/50">No price</div>
                    )}
                    <div className="text-[10px] text-muted/40 mt-1">
                      {stock._count.files > 0 && <span>{stock._count.files} docs</span>}
                      {stock._count.notes > 0 && (
                        <span className="ml-1">{stock._count.notes} notes</span>
                      )}
                    </div>
                    {stock.lastSummaryAt && (
                      <div className="text-[10px] text-muted/40 mt-0.5">
                        {timeAgo(stock.lastSummaryAt)}
                      </div>
                    )}
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
