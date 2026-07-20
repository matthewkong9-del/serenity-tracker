"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { formatBytes, timeAgo, parseStance, STANCE_COLORS } from "@/lib/db";
import { ErrorBoundary } from "@/app/components/ErrorBoundary";
import {
  PriceChart,
  KeyRelationships,
  ContrarianAngles,
  BottomLine,
  ThesisDrift,
  RecentActivity,
} from "./Overview";

interface StockFile {
  id: number;
  filename: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  description: string | null;
  markdown: string | null;
  createdAt: string;
}

interface Note {
  id: number;
  title: string | null;
  content: string;
  tag: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Claim {
  id: number;
  text: string;
  source: string | null;
  status: string;
  evidence: string | null;
  researchStatus: string;
  researchedAt: string | null;
  tweetId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Relationship {
  id: number;
  type: string;
  target: string;
  description: string | null;
  sources: string | null;
  sourceConfidence: string;
  section: string;
  createdAt: string;
}

interface Stock {
  id: number;
  ticker: string;
  name: string | null;
  sector: string | null;
  generalNotes: string | null;
  summary: string | null;
  lastSummaryAt: string | null;
  extractionError: string | null;
  files: StockFile[];
  notes: Note[];
  claims: Claim[];
  relationships: Relationship[];
}

type ViewMode = "read" | "research";

const CLAIM_STATUSES = ["unverified", "supported", "refuted", "disputed"] as const;

const CLAIM_COLORS: Record<string, string> = {
  unverified: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  supported: "text-green-400 border-green-400/30 bg-green-400/10",
  refuted: "text-red-400 border-red-400/30 bg-red-400/10",
  disputed: "text-blue-400 border-blue-400/30 bg-blue-400/10",
};

export default function StockPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = params.ticker as string;
  const [stock, setStock] = useState<Stock | null>(null);
  const [mode, setMode] = useState<ViewMode>("read");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // URL conversion
  const [urlInput, setUrlInput] = useState("");
  const [convertingUrl, setConvertingUrl] = useState(false);
  const [urlError, setUrlError] = useState("");

  // Summary states
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  // New note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteTag, setNoteTag] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Edit note
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTag, setEditTag] = useState("");

  // Edit claim
  const [editingClaimId, setEditingClaimId] = useState<number | null>(null);
  const [editEvidence, setEditEvidence] = useState("");

  // Claim verification
  const [verifyingClaimId, setVerifyingClaimId] = useState<number | null>(null);

  // Batch verification
  const [batchVerifying, setBatchVerifying] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  // Dedup
  const [findingDuplicates, setFindingDuplicates] = useState(false);
  const [dupGroups, setDupGroups] = useState<
    { claimIds: number[]; texts: string[]; similarity: number }[]
  >([]);

  // Relationship remapping
  const [remapping, setRemapping] = useState(false);
  const [remapError, setRemapError] = useState("");

  const load = useCallback(() => {
    fetch(`/api/stocks/${ticker}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setStock)
      .catch(() => router.push("/"));
  }, [ticker, router]);

  useEffect(() => { load(); }, [load]);

  const needsSummary = stock
    ? !stock.lastSummaryAt ||
      stock.files.some((f) => new Date(f.createdAt) > new Date(stock.lastSummaryAt!)) ||
      stock.notes.some((e) => new Date(e.createdAt) > new Date(stock.lastSummaryAt!)) ||
      stock.claims.some((c) => new Date(c.createdAt) > new Date(stock.lastSummaryAt!)) ||
      stock.relationships.some((r) => new Date(r.createdAt) > new Date(stock.lastSummaryAt!))
    : false;

  async function handleSummarize() {
    setSummarizing(true); setSummaryError("");
    const res = await fetch(`/api/stocks/${ticker}/summarize`, { method: "POST" });
    setSummarizing(false);
    if (res.ok) { load(); }
    else { const data = await res.json(); setSummaryError(data.error || "Failed to summarize"); }
  }

  async function handleReMap() {
    setRemapping(true); setRemapError("");
    const res = await fetch(`/api/stocks/${ticker}/relationships`, { method: "POST" });
    setRemapping(false);
    if (res.ok) { load(); }
    else { const data = await res.json(); setRemapError(data.error || "Failed to remap"); }
  }

  async function dismissExtractionError() {
    await fetch(`/api/stocks/${ticker}/relationships`, { method: "DELETE" });
    load();
  }

  async function handleVerifyClaim(claimId: number) {
    setVerifyingClaimId(claimId);
    const res = await fetch(`/api/stocks/${ticker}/claims/${claimId}/verify`, { method: "POST" });
    setVerifyingClaimId(null);
    if (!res.ok) { const data = await res.json(); alert(data.error || "Verification failed"); }
    load();
  }

  async function handleVerifyAll() {
    const unverified = stock?.claims.filter((c) => c.status === "unverified") || [];
    if (unverified.length === 0) return;
    setBatchVerifying(true); setBatchProgress({ done: 0, total: unverified.length });
    const res = await fetch(`/api/stocks/${ticker}/verify-all`, { method: "POST" });
    if (res.ok) { const data = await res.json(); setBatchProgress({ done: data.verified, total: unverified.length }); }
    else { const data = await res.json(); alert(data.error || "Batch verification failed"); }
    setBatchVerifying(false); load();
  }

  async function handleFindDuplicates() {
    setFindingDuplicates(true);
    const res = await fetch(`/api/stocks/${ticker}/dedup-claims`, { method: "POST" });
    setFindingDuplicates(false);
    if (res.ok) { const data = await res.json(); setDupGroups(data.groups || []); }
  }

  async function handleMergeDuplicates(keepId: number, deleteIds: number[]) {
    await fetch(`/api/stocks/${ticker}/dedup-claims`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepId, deleteIds }),
    });
    setDupGroups((prev) => prev.filter((g) => !deleteIds.includes(g.claimIds[0])));
    load();
  }

  function handleExport(format: "csv" | "md") {
    window.open(`/api/export/claims?format=${format}&ticker=${ticker}`, "_blank");
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData(); fd.append("file", file);
      await fetch(`/api/stocks/${ticker}/files`, { method: "POST", body: fd });
    }
    setUploading(false); load();
  }

  async function handleUrlConvert() {
    if (!urlInput.trim()) return;
    setConvertingUrl(true); setUrlError("");
    const res = await fetch("/api/convert-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: urlInput.trim() }) });
    if (!res.ok) { const data = await res.json(); setUrlError(data.error || "Conversion failed"); setConvertingUrl(false); return; }
    const { markdown } = await res.json();
    const fd = new FormData();
    const name = urlInput.replace(/^https?:\/\//, "").split("/")[0] || "webpage";
    const blob = new Blob([markdown], { type: "text/markdown" });
    fd.append("file", blob, `${name}.md`);
    await fetch(`/api/stocks/${ticker}/files`, { method: "POST", body: fd });
    setUrlInput(""); setConvertingUrl(false); load();
  }

  async function deleteFile(id: number) {
    if (!confirm("Delete this file?")) return;
    await fetch(`/api/stocks/${ticker}/files/${id}`, { method: "DELETE" });
    load();
  }

  async function saveNote() {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    await fetch(`/api/stocks/${ticker}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: noteTitle, content: noteContent, tag: noteTag }) });
    setNoteTitle(""); setNoteContent(""); setNoteTag(""); setShowNoteForm(false); setSavingNote(false);
    load();
  }

  function startEdit(entry: Note) {
    setEditingId(entry.id); setEditTitle(entry.title || ""); setEditContent(entry.content); setEditTag(entry.tag || "");
  }

  async function saveEdit(id: number) {
    await fetch(`/api/stocks/${ticker}/entries/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: editTitle, content: editContent, tag: editTag }) });
    setEditingId(null); load();
  }

  async function deleteEntry(id: number) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/stocks/${ticker}/entries/${id}`, { method: "DELETE" });
    load();
  }

  async function cycleClaimStatus(claim: Claim) {
    const idx = CLAIM_STATUSES.indexOf(claim.status as any);
    const next = CLAIM_STATUSES[(idx + 1) % CLAIM_STATUSES.length];
    await fetch(`/api/stocks/${ticker}/claims/${claim.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    load();
  }

  async function saveClaimEvidence(claimId: number) {
    await fetch(`/api/stocks/${ticker}/claims/${claimId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evidence: editEvidence }) });
    setEditingClaimId(null); setEditEvidence(""); load();
  }

  function startEditClaim(claim: Claim) {
    setEditingClaimId(claim.id); setEditEvidence(claim.evidence || "");
  }

  async function deleteStock() {
    if (!confirm("Delete this stock and all its files/notes/claims?")) return;
    await fetch(`/api/stocks/${ticker}`, { method: "DELETE" });
    router.push("/");
  }

  if (!stock) return <div className="text-muted text-center py-20">Loading...</div>;

  const existingTags = Array.from(new Set(stock.notes.map((e) => e.tag).filter(Boolean))) as string[];
  const isImage = (type: string) => ["jpg","jpeg","png","gif","webp"].includes(type);
  const isPdf = (type: string) => type === "pdf";
  const timeline = [
    ...stock.files.map((f) => ({ type: "file" as const, date: f.createdAt, data: f })),
    ...stock.notes.map((e) => ({ type: "entry" as const, date: e.createdAt, data: e })),
    ...stock.relationships.map((r) => ({ type: "relationship" as const, date: r.createdAt, data: r })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-fg">${stock.ticker}</h1>
            {parseStance(stock.summary) && (
              <span className={`text-xs border rounded-full px-3 py-1 ${STANCE_COLORS[parseStance(stock.summary)!]}`}>
                {parseStance(stock.summary)}
              </span>
            )}
            {stock.sector && (
              <span className="text-xs bg-surface border border-border rounded-full px-3 py-0.5 text-muted">{stock.sector}</span>
            )}
          </div>
          {stock.name && <p className="text-muted mt-1">{stock.name}</p>}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
            <span className="text-fg font-mono">
              {(stock as any).currentPrice != null ? `$${(stock as any).currentPrice.toFixed(2)}` : "Price: —"}
            </span>
            <span>P/B {(stock as any).pbRatio != null ? (stock as any).pbRatio.toFixed(1) : "—"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-bg border border-border rounded-lg p-0.5">
            <button onClick={() => setMode("read")}
              className={`px-3 py-1.5 text-xs rounded-md transition ${mode === "read" ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}>
              Read
            </button>
            <button onClick={() => setMode("research")}
              className={`px-3 py-1.5 text-xs rounded-md transition ${mode === "research" ? "bg-accent text-bg" : "text-muted hover:text-fg"}`}>
              Research
            </button>
          </div>
          <button onClick={() => router.push(`/stocks/${ticker}/edit`)}
            className="border border-border text-muted px-4 py-1.5 rounded-lg text-sm hover:text-fg hover:border-fg/30 transition">Edit</button>
          <button onClick={deleteStock}
            className="border border-red-900 text-red-400 px-4 py-1.5 rounded-lg text-sm hover:bg-red-900/20 transition">Delete</button>
        </div>
      </div>

      {/* ========== READ MODE ========== */}
      {mode === "read" && (
        <div className="space-y-6">
          <PriceChart ticker={ticker} sector={stock.sector} />
          <BottomLine summary={stock.summary} lastSummaryAt={stock.lastSummaryAt}
            needsSummary={needsSummary} summarizing={summarizing} summaryError={summaryError}
            onSummarize={handleSummarize} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <KeyRelationships relationships={stock.relationships} onViewAll={() => setMode("research")} />
            <ContrarianAngles relationships={stock.relationships} />
          </div>
          <ErrorBoundary>
            <ThesisDrift summary={stock.summary} ticker={ticker}
              resolvedClaimCount={stock.claims.filter((c) => c.status === "supported" || c.status === "refuted" || c.status === "disputed").length} />
          </ErrorBoundary>
          <RecentActivity timeline={timeline} />
        </div>
      )}

      {/* ========== RESEARCH MODE ========== */}
      {mode === "research" && (
        <div className="space-y-8">
          {/* Claims */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-fg/60 uppercase tracking-wider">Claims ({stock.claims.length})</h2>
              <div className="flex items-center gap-2">
                {stock.claims.filter((c) => c.status === "unverified").length > 0 && (
                  <button onClick={handleVerifyAll} disabled={batchVerifying}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${batchVerifying ? "border border-border text-muted cursor-wait" : "bg-accent text-bg hover:bg-accent/90"}`}>
                    {batchVerifying ? `Verifying ${batchProgress.done}/${batchProgress.total}...` : `Verify All (${stock.claims.filter((c) => c.status === "unverified").length})`}
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2 mb-4 flex-wrap">
              {(["all", ...CLAIM_STATUSES] as const).map((s) => {
                const count = s === "all" ? stock.claims.length : stock.claims.filter((c) => c.status === s).length;
                const isActive = statusFilter === s || (s === "all" && !statusFilter);
                return (
                  <button key={s} onClick={() => setStatusFilter(isActive ? null : s)}
                    className={`text-xs border rounded-full px-3 py-1 transition ${isActive ? CLAIM_COLORS[s] || "bg-accent/10 text-accent border-accent/30" : "border-border text-muted hover:text-fg"}`}>
                    {s === "all" ? "All" : s} ({count})
                  </button>
                );
              })}
            </div>

            {dupGroups.length > 0 && (
              <div className="mb-4 bg-amber-400/5 border border-amber-400/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-amber-400 font-medium">{dupGroups.length} potential duplicate group{dupGroups.length !== 1 ? "s" : ""}</p>
                  <button onClick={() => setDupGroups([])} className="text-muted hover:text-fg text-xs transition">Dismiss</button>
                </div>
                <div className="space-y-3">
                  {dupGroups.map((g, gi) => (
                    <div key={gi} className="bg-bg rounded-lg p-3 border border-border">
                      <p className="text-muted/60 text-xs mb-2">{g.similarity}% similar · {g.claimIds.length} claims</p>
                      <div className="space-y-1.5">
                        {g.texts.map((t, ti) => (
                          <div key={ti} className="flex items-start gap-2 text-sm">
                            <span className="text-muted text-xs mt-0.5">{ti + 1}.</span>
                            <p className="text-fg/80 flex-1">{t}</p>
                            {ti > 0 && (
                              <button onClick={() => handleMergeDuplicates(g.claimIds[0], [g.claimIds[ti]])}
                                className="text-accent text-xs hover:underline shrink-0">Merge into #1</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stock.claims.length === 0 ? (
              <p className="text-muted text-center py-10">No claims yet. Sync tweets to extract claims.</p>
            ) : (
              <div className="space-y-3">
                {stock.claims.filter((c) => !statusFilter || c.status === statusFilter).map((claim) => (
                  <div key={claim.id} className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <button onClick={() => cycleClaimStatus(claim)}
                        className={`text-xs border rounded-full px-2.5 py-1 whitespace-nowrap mt-0.5 transition hover:opacity-80 ${CLAIM_COLORS[claim.status]}`}
                        title="Click to cycle: unverified → supported → refuted → disputed">
                        {claim.status}
                      </button>
                      {claim.researchStatus === "researching" && (
                        <span className="text-xs bg-blue-400/10 text-blue-400 border border-blue-400/20 rounded-full px-2 py-0.5 whitespace-nowrap mt-0.5 animate-pulse">🔍 researching...</span>
                      )}
                      {claim.researchStatus === "done" && (
                        <span className="text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2 py-0.5 whitespace-nowrap mt-0.5"
                          title={`Researched ${claim.researchedAt ? new Date(claim.researchedAt).toLocaleString() : ""}`}>✅ researched</span>
                      )}
                      {claim.researchStatus === "failed" && (
                        <span className="text-xs bg-red-400/10 text-red-400 border border-red-400/20 rounded-full px-2 py-0.5 whitespace-nowrap mt-0.5">⚠️ failed</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-fg text-sm">{claim.text}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {claim.source && <span className="text-muted text-xs">{claim.source}</span>}
                          <button onClick={() => startEditClaim(claim)} className="text-muted hover:text-fg text-xs transition">
                            {claim.evidence ? "Edit" : "+ Add evidence"}
                          </button>
                        </div>
                        {editingClaimId === claim.id ? (
                          <div className="mt-3 space-y-3">
                            <textarea value={editEvidence} onChange={(e) => setEditEvidence(e.target.value)}
                              placeholder="Paste links, notes, or data..." rows={3}
                              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm resize-none" />
                            <div className="flex gap-2">
                              <button onClick={() => saveClaimEvidence(claim.id)} className="bg-accent text-bg px-3 py-1.5 rounded text-xs font-medium">Save</button>
                              <button onClick={() => setEditingClaimId(null)} className="border border-border text-muted px-3 py-1.5 rounded text-xs">Cancel</button>
                            </div>
                          </div>
                        ) : claim.evidence ? (
                          <div className="mt-2 bg-bg border border-border rounded-lg p-3">
                            <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed [&_a]:text-accent [&_strong]:text-fg [&_p]:my-1">
                              <ReactMarkdown>{claim.evidence}</ReactMarkdown>
                            </div>
                            <button onClick={() => startEditClaim(claim)} className="text-muted hover:text-fg text-[10px] mt-2 transition">Edit</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Files */}
          <section>
            <h2 className="text-sm font-semibold text-fg/60 uppercase tracking-wider mb-4">Files ({stock.files.length})</h2>
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition mb-4 ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-muted"}`}>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
              <p className="text-muted text-sm">{uploading ? "Uploading..." : "Drop files or click to upload"}</p>
              <p className="text-muted/50 text-xs mt-1">PDFs, DOCX, images, audio — auto-converted to Markdown</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4 mb-4">
              <div className="flex gap-2">
                <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUrlConvert()}
                  placeholder="Paste URL to convert..." className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-muted/50" />
                <button onClick={handleUrlConvert} disabled={convertingUrl || !urlInput.trim()}
                  className="bg-accent text-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50 whitespace-nowrap">
                  {convertingUrl ? "Converting..." : "Convert & Save"}
                </button>
              </div>
              {urlError && <p className="text-red-400 text-xs mt-2">{urlError}</p>}
            </div>
            {stock.files.length === 0 ? (
              <p className="text-muted text-center py-6">No files yet</p>
            ) : (
              <div className="space-y-3">
                {stock.files.map((file) => (
                  <div key={file.id} className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs bg-bg border rounded px-2 py-0.5 uppercase ${["md","txt"].includes(file.fileType) ? "border-accent/30 text-accent" : "border-border text-muted"}`}>{file.fileType}</span>
                          <a href={`/uploads/${ticker}/${file.filename}`} target="_blank" className="text-fg text-sm font-medium hover:text-accent transition truncate">{file.originalName}</a>
                          {file.markdown ? (
                            <span className="text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2 py-0.5">AI-ready</span>
                          ) : (
                            <span className="text-xs bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded-full px-2 py-0.5">not indexed</span>
                          )}
                        </div>
                        <p className="text-muted text-xs mt-1">{formatBytes(file.fileSize)} · {timeAgo(file.createdAt)}</p>
                        {isImage(file.fileType) && (
                          <div className="mt-3 rounded-lg overflow-hidden border border-border max-w-md">
                            <img src={`/uploads/${ticker}/${file.filename}`} alt={file.originalName} className="max-h-64 w-auto" />
                          </div>
                        )}
                        {isPdf(file.fileType) && (
                          <div className="mt-3">
                            <iframe src={`/uploads/${ticker}/${file.filename}`} className="w-full h-96 rounded-lg border border-border" title={file.originalName} />
                          </div>
                        )}
                      </div>
                      <button onClick={() => deleteFile(file.id)} className="text-muted hover:text-red-400 text-xs ml-3 transition">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Notes */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-fg/60 uppercase tracking-wider">Notes ({stock.notes.length})</h2>
              <button onClick={() => setShowNoteForm(!showNoteForm)} className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg font-medium hover:bg-accent/90 transition">
                {showNoteForm ? "Cancel" : "+ Add Note"}
              </button>
            </div>
            {showNoteForm && (
              <div className="bg-surface border border-border rounded-xl p-4 mb-4 space-y-3">
                <input type="text" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Title (optional)"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm" />
                <div className="flex gap-2">
                  <input type="text" value={noteTag} onChange={(e) => setNoteTag(e.target.value)} placeholder="Tag" list="tags"
                    className="w-32 bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm" />
                  <datalist id="tags">{existingTags.map((t) => (<option key={t} value={t} />))}</datalist>
                </div>
                <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="Write your note..." rows={3}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm resize-none" />
                <button onClick={saveNote} disabled={savingNote || !noteContent.trim()}
                  className="bg-accent text-bg px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-accent/90 transition disabled:opacity-50">
                  {savingNote ? "Saving..." : "Save"}
                </button>
              </div>
            )}
            {stock.notes.length === 0 && !showNoteForm ? (
              <p className="text-muted text-center py-6">No notes yet</p>
            ) : (
              <div className="space-y-3">
                {stock.notes.map((entry) => (
                  <div key={entry.id} className="bg-surface border border-border rounded-xl p-4">
                    {editingId === entry.id ? (
                      <div className="space-y-3">
                        <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title"
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm" />
                        <input type="text" value={editTag} onChange={(e) => setEditTag(e.target.value)} placeholder="Tag"
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm" />
                        <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3}
                          className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(entry.id)} className="bg-accent text-bg px-3 py-1.5 rounded text-xs font-medium">Save</button>
                          <button onClick={() => setEditingId(null)} className="border border-border text-muted px-3 py-1.5 rounded text-xs">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            {entry.tag && <span className="text-xs bg-bg border border-border rounded px-2 py-0.5 text-accent">{entry.tag}</span>}
                            {entry.title && <p className="text-fg font-medium text-sm">{entry.title}</p>}
                          </div>
                          <p className="text-fg/80 text-sm mt-1 whitespace-pre-wrap">{entry.content}</p>
                          <p className="text-muted text-xs mt-1">{timeAgo(entry.createdAt)}</p>
                        </div>
                        <div className="flex gap-2 ml-3">
                          <button onClick={() => startEdit(entry)} className="text-muted hover:text-fg text-xs transition">Edit</button>
                          <button onClick={() => deleteEntry(entry.id)} className="text-muted hover:text-red-400 text-xs transition">Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Actions */}
          <section>
            <h2 className="text-sm font-semibold text-fg/60 uppercase tracking-wider mb-4">Actions</h2>
            <div className="flex flex-wrap gap-3 items-center">
              <button onClick={handleSummarize} disabled={summarizing || !needsSummary}
                title={!needsSummary ? "Already up to date" : ""}
                className={`text-xs px-4 py-2 rounded-lg font-medium transition ${needsSummary ? "bg-accent text-bg hover:bg-accent/90" : "border border-border text-muted cursor-not-allowed"}`}>
                {summarizing ? "Summarizing..." : "Run Summary"}
              </button>
              {summaryError && <p className="text-red-400 text-xs">{summaryError}</p>}
              <button onClick={handleReMap} disabled={remapping}
                className={`text-xs px-4 py-2 rounded-lg font-medium transition ${remapping ? "border border-border text-muted cursor-wait" : "border border-border text-muted hover:text-fg"}`}>
                {remapping ? "Mapping..." : "Re-map Relationships"}
              </button>
              {remapError && <p className="text-red-400 text-xs">{remapError}</p>}
              {stock.extractionError && (
                <button onClick={dismissExtractionError} className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 hover:bg-red-400/20 transition">
                  ⚠️ Extraction error — dismiss
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
