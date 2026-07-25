"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { parseStance, STANCE_COLORS, timeAgo } from "@/lib/db";
import { BUCKET_LABELS, BUCKET_COLORS, type OpportunityBucket } from "@/lib/scoring";
import StockNarrative from "./knowledge-base/StockNarrative";
import EvidenceCards from "./knowledge-base/EvidenceCards";
import Changelog from "./knowledge-base/Changelog";

// ── Types ──

interface StockData {
  id: number;
  ticker: string;
  name: string | null;
  sector: string | null;
  summary: string | null;
  narrative: string | null;
  lastSummaryAt: string | null;
  currentPrice: number | null;
  pbRatio: number | null;
  marketCap: number | null;
  chokepointDepth: number | null;
  extractionError: string | null;
  stance?: string;
  bucket?: OpportunityBucket;
  claimCounts?: { supported: number; refuted: number; disputed: number; unverified: number; total: number };
  files: { id: number; originalName: string; fileType: string; createdAt: string }[];
  notes: { id: number; title: string | null; content: string; tag: string | null; createdAt: string }[];
  claims: { id: number; text: string; status: string; evidence: string | null; researchStatus: string; createdAt: string }[];
  _count?: { files: number; notes: number; claims: number };
}

// ── Page ──

export default function StockKBPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = (params.ticker as string).toUpperCase();
  const [stock, setStock] = useState<StockData | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/stocks/${ticker}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => {
        // Compute stance and claim counts client-side
        const counts = { supported: 0, refuted: 0, disputed: 0, unverified: 0, total: 0 };
        for (const c of data.claims || []) {
          if (c.status in counts) { (counts as any)[c.status]++; }
          else { counts.unverified++; }
          counts.total++;
        }
        setStock({
          ...data,
          stance: parseStance(data.summary),
          claimCounts: counts,
        });
      })
      .catch(() => router.push("/"));
  }, [ticker, router]);

  useEffect(() => { load(); }, [load]);

  const needsSummary = stock
    ? !stock.lastSummaryAt ||
      stock.files.some((f: any) => new Date(f.createdAt) > new Date(stock.lastSummaryAt!)) ||
      stock.notes.some((e: any) => new Date(e.createdAt) > new Date(stock.lastSummaryAt!)) ||
      stock.claims.some((c: any) => new Date(c.createdAt) > new Date(stock.lastSummaryAt!))
    : false;

  async function handleSummarize() {
    setSummarizing(true);
    await fetch(`/api/stocks/${ticker}/summarize`, { method: "POST" });
    setSummarizing(false);
    // Wait a bit for the narrative to generate, then reload
    setTimeout(() => load(), 2000);
  }

  async function handleSaveNarrative(text: string) {
    await fetch(`/api/stocks/${ticker}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrative: text }),
    });
    load();
  }

  if (!stock) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted text-sm">Loading...</div>
      </div>
    );
  }

  const stance = parseStance(stock.summary);

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* ── Header ── */}
      <div className="mb-6">
        <Link
          href="/"
          className="text-xs text-muted hover:text-fg transition mb-3 inline-block"
        >
          ← Back to library
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-fg">${stock.ticker}</h1>
              {stock.name && (
                <span className="text-sm text-muted">{stock.name}</span>
              )}
              {stock.sector && (
                <span className="text-[10px] border border-border rounded-full px-2 py-0.5 text-muted">
                  {stock.sector}
                </span>
              )}
            </div>

            {/* Stance + score + price row */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {stance && (
                <span
                  className={`text-[10px] border rounded-full px-2 py-0.5 ${
                    STANCE_COLORS[stance] || ""
                  }`}
                >
                  {stance}
                </span>
              )}
              {stock.bucket && (
                <span
                  className={`text-[10px] border rounded-full px-2 py-0.5 ${
                    BUCKET_COLORS[stock.bucket]
                  }`}
                >
                  {BUCKET_LABELS[stock.bucket]}
                </span>
              )}
              {stock.currentPrice && (
                <span className="text-xs text-fg/80 font-medium">
                  ${stock.currentPrice.toFixed(2)}
                </span>
              )}
              {stock.pbRatio && (
                <span className="text-[10px] text-muted">
                  {stock.pbRatio.toFixed(1)}x P/B
                </span>
              )}
              {stock.lastSummaryAt && (
                <span className="text-[10px] text-muted/50">
                  Updated {timeAgo(stock.lastSummaryAt)}
                </span>
              )}
            </div>
          </div>

          {/* Summarize button */}
          <button
            onClick={handleSummarize}
            disabled={summarizing || !needsSummary}
            className={`text-xs px-3 py-2 rounded-lg transition ${
              needsSummary
                ? "bg-accent text-bg hover:opacity-90"
                : "border border-border text-muted cursor-not-allowed"
            }`}
            title={needsSummary ? "New data available — refresh analysis" : "Analysis is up to date"}
          >
            {summarizing ? "Analyzing..." : needsSummary ? "🔄 Refresh analysis" : "✓ Up to date"}
          </button>
        </div>

        {/* Extraction error banner */}
        {stock.extractionError && (
          <div className="mt-3 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 text-xs text-red-400">
            ⚠️ {stock.extractionError}
          </div>
        )}
      </div>

      {/* ── Story Hero ── */}
      <div className="mb-6">
        <StockNarrative
          narrative={stock.narrative}
          ticker={ticker}
          onSave={handleSaveNarrative}
        />
      </div>

      {/* ── Evidence Cards ── */}
      {stock.claimCounts && (
        <div className="mb-6">
          <EvidenceCards
            chokepointDepth={stock.chokepointDepth}
            pbRatio={stock.pbRatio}
            marketCap={stock.marketCap}
            currentPrice={stock.currentPrice}
            claimCounts={stock.claimCounts}
            summary={stock.summary}
          />
        </div>
      )}

      {/* ── Changelog ── */}
      <div className="mb-6">
        <Changelog ticker={ticker} />
      </div>

      {/* ── Deep Dive Sections ── */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="flex border-b border-border">
          {[
            { key: "claims", label: "Claims", count: stock.claimCounts?.total },
            { key: "documents", label: "Documents", count: stock._count?.files ?? stock.files.length },
            { key: "notes", label: "Notes", count: stock._count?.notes ?? stock.notes.length },
            { key: "summary", label: "Raw Summary", count: undefined },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveSection(activeSection === key ? null : key)}
              className={`flex-1 text-xs px-4 py-3 text-center transition border-b-2 ${
                activeSection === key
                  ? "border-accent text-accent font-medium"
                  : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {label}
              {count !== undefined && (
                <span className="ml-1 text-muted/50">({count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Claims section */}
        {activeSection === "claims" && (
          <div className="p-4 max-h-96 overflow-y-auto space-y-2">
            {stock.claims.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">No claims yet.</p>
            ) : (
              stock.claims.map((c) => {
                const colors: Record<string, string> = {
                  unverified: "border-yellow-400/20 bg-yellow-400/5",
                  supported: "border-green-400/20 bg-green-400/5",
                  refuted: "border-red-400/20 bg-red-400/5",
                  disputed: "border-blue-400/20 bg-blue-400/5",
                };
                return (
                  <div
                    key={c.id}
                    className={`border rounded-lg px-3 py-2 text-xs ${colors[c.status] || ""}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] border rounded-full px-1.5 py-0.5 ${
                        c.status === "supported" ? "text-green-400 border-green-400/30 bg-green-400/10" :
                        c.status === "refuted" ? "text-red-400 border-red-400/30 bg-red-400/10" :
                        c.status === "disputed" ? "text-blue-400 border-blue-400/30 bg-blue-400/10" :
                        "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
                      }`}>
                        {c.status}
                      </span>
                      <span className="text-muted/50">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="text-fg/80 leading-relaxed">{c.text}</p>
                    {c.evidence && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-muted cursor-pointer hover:text-fg">
                          Evidence
                        </summary>
                        <div className="mt-1 text-[11px] text-muted prose prose-invert prose-xs max-w-none">
                          <ReactMarkdown>{c.evidence}</ReactMarkdown>
                        </div>
                      </details>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Documents section */}
        {activeSection === "documents" && (
          <div className="p-4 max-h-96 overflow-y-auto space-y-2">
            {stock.files.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">
                No documents uploaded.{" "}
                <Link href={`/stocks/${ticker}?tab=files`} className="text-accent hover:underline">
                  Upload one →
                </Link>
              </p>
            ) : (
              stock.files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 text-xs border border-border rounded-lg px-3 py-2"
                >
                  <span className="text-muted">📄</span>
                  <span className="text-fg/80 truncate flex-1">{f.originalName}</span>
                  <span className="text-muted/50">{f.fileType}</span>
                  <span className="text-muted/50">{timeAgo(f.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Notes section */}
        {activeSection === "notes" && (
          <div className="p-4 max-h-96 overflow-y-auto space-y-2">
            {stock.notes.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">
                No notes yet.{" "}
                <Link href={`/stocks/${ticker}?tab=notes`} className="text-accent hover:underline">
                  Add one →
                </Link>
              </p>
            ) : (
              stock.notes.map((n) => (
                <div
                  key={n.id}
                  className="border border-border rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {n.title && <span className="text-xs font-medium text-fg">{n.title}</span>}
                    {n.tag && (
                      <span className="text-[10px] border border-border rounded-full px-1.5 py-0.5 text-muted">
                        {n.tag}
                      </span>
                    )}
                    <span className="text-[10px] text-muted/50 ml-auto">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-xs text-fg/70 leading-relaxed line-clamp-3">{n.content}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Raw Summary section */}
        {activeSection === "summary" && (
          <div className="p-4 max-h-96 overflow-y-auto">
            {stock.summary ? (
              <div className="prose prose-invert prose-xs max-w-none text-muted">
                <ReactMarkdown>{stock.summary}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-xs text-muted text-center py-4">No summary yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
