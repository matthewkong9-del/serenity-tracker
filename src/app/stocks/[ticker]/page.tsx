"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { formatBytes, timeAgo, parseStance, STANCE_COLORS } from "@/lib/db";
import { ErrorBoundary } from "@/app/components/ErrorBoundary";
import {
  StanceCard,
  ClaimHealth,
  ResearchPriorities,
  KeyRelationships,
  ContrarianAngles,
  BottomLine,
  ThesisDrift,
  ResearchPlan,
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

interface Entry {
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
  confidence: string;
  section: string;
  createdAt: string;
}

interface Stock {
  id: number;
  ticker: string;
  name: string | null;
  sector: string | null;
  notes: string | null;
  summary: string | null;
  lastSummaryAt: string | null;
  extractionError: string | null;
  files: StockFile[];
  entries: Entry[];
  claims: Claim[];
  relationships: Relationship[];
}

type Tab = "overview" | "files" | "notes" | "claims" | "relationships" | "all";

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
  const [tab, setTab] = useState<Tab>("overview");
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
    {
      claimIds: number[];
      texts: string[];
      similarity: number;
    }[]
  >([]);

  // Relationship remapping
  const [remapping, setRemapping] = useState(false);
  const [remapError, setRemapError] = useState("");

  const load = useCallback(() => {
    fetch(`/api/stocks/${ticker}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setStock)
      .catch(() => router.push("/"));
  }, [ticker, router]);

  useEffect(() => {
    load();
  }, [load]);

  // LOGIC: Does the summary need updating?
  const needsSummary = stock
    ? !stock.lastSummaryAt ||
      stock.files.some((f) => new Date(f.createdAt) > new Date(stock.lastSummaryAt!)) ||
      stock.entries.some((e) => new Date(e.createdAt) > new Date(stock.lastSummaryAt!)) ||
      stock.claims.some((c) => new Date(c.createdAt) > new Date(stock.lastSummaryAt!)) ||
      stock.relationships.some((r) => new Date(r.createdAt) > new Date(stock.lastSummaryAt!))
    : false;

  async function handleSummarize() {
    setSummarizing(true);
    setSummaryError("");
    const res = await fetch(`/api/stocks/${ticker}/summarize`, { method: "POST" });
    setSummarizing(false);

    if (res.ok) {
      load(); // Refresh to show new summary and update button state
    } else {
      const data = await res.json();
      setSummaryError(data.error || "Failed to summarize");
    }
  }

  async function handleReMap() {
    setRemapping(true);
    setRemapError("");
    const res = await fetch(`/api/stocks/${ticker}/relationships`, { method: "POST" });
    setRemapping(false);
    if (res.ok) {
      load();
    } else {
      const data = await res.json();
      setRemapError(data.error || "Failed to remap");
    }
  }

  async function dismissExtractionError() {
    await fetch(`/api/stocks/${ticker}/relationships`, { method: "DELETE" });
    load();
  }

  async function handleVerifyClaim(claimId: number) {
    setVerifyingClaimId(claimId);
    const res = await fetch(`/api/stocks/${ticker}/claims/${claimId}/verify`, {
      method: "POST",
    });
    setVerifyingClaimId(null);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Verification failed");
    }
    load();
  }

  async function handleVerifyAll() {
    const unverified = stock?.claims.filter((c) => c.status === "unverified") || [];
    if (unverified.length === 0) return;

    setBatchVerifying(true);
    setBatchProgress({ done: 0, total: unverified.length });

    const res = await fetch(`/api/stocks/${ticker}/verify-all`, {
      method: "POST",
    });

    if (res.ok) {
      const data = await res.json();
      setBatchProgress({ done: data.verified, total: unverified.length });
    } else {
      const data = await res.json();
      alert(data.error || "Batch verification failed");
    }

    setBatchVerifying(false);
    load();
  }

  async function handleFindDuplicates() {
    setFindingDuplicates(true);
    const res = await fetch(`/api/stocks/${ticker}/dedup-claims`, {
      method: "POST",
    });
    setFindingDuplicates(false);

    if (res.ok) {
      const data = await res.json();
      setDupGroups(data.groups || []);
    }
  }

  async function handleMergeDuplicates(keepId: number, deleteIds: number[]) {
    await fetch(`/api/stocks/${ticker}/dedup-claims`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
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
      const fd = new FormData();
      fd.append("file", file);
      await fetch(`/api/stocks/${ticker}/files`, { method: "POST", body: fd });
    }
    setUploading(false);
    load();
  }

  async function handleUrlConvert() {
    if (!urlInput.trim()) return;
    setConvertingUrl(true);
    setUrlError("");

    const res = await fetch("/api/convert-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlInput.trim() }),
    });

    if (!res.ok) {
      const data = await res.json();
      setUrlError(data.error || "Conversion failed");
      setConvertingUrl(false);
      return;
    }

    const { markdown } = await res.json();

    // Save as a file attached to this stock
    const fd = new FormData();
    const name = urlInput.replace(/^https?:\/\//, "").split("/")[0] || "webpage";
    const blob = new Blob([markdown], { type: "text/markdown" });
    fd.append("file", blob, `${name}.md`);
    await fetch(`/api/stocks/${ticker}/files`, { method: "POST", body: fd });

    setUrlInput("");
    setConvertingUrl(false);
    load();
  }

  async function deleteFile(id: number) {
    if (!confirm("Delete this file?")) return;
    await fetch(`/api/stocks/${ticker}/files/${id}`, { method: "DELETE" });
    load();
  }

  async function saveNote() {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    await fetch(`/api/stocks/${ticker}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: noteTitle, content: noteContent, tag: noteTag }),
    });
    setNoteTitle("");
    setNoteContent("");
    setNoteTag("");
    setShowNoteForm(false);
    setSavingNote(false);
    load();
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setEditTitle(entry.title || "");
    setEditContent(entry.content);
    setEditTag(entry.tag || "");
  }

  async function saveEdit(id: number) {
    await fetch(`/api/stocks/${ticker}/entries/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, content: editContent, tag: editTag }),
    });
    setEditingId(null);
    load();
  }

  async function deleteEntry(id: number) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/stocks/${ticker}/entries/${id}`, { method: "DELETE" });
    load();
  }

  async function cycleClaimStatus(claim: Claim) {
    const idx = CLAIM_STATUSES.indexOf(claim.status as any);
    const next = CLAIM_STATUSES[(idx + 1) % CLAIM_STATUSES.length];
    await fetch(`/api/stocks/${ticker}/claims/${claim.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    load();
  }

  async function saveClaimEvidence(claimId: number) {
    await fetch(`/api/stocks/${ticker}/claims/${claimId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence: editEvidence }),
    });
    setEditingClaimId(null);
    setEditEvidence("");
    load();
  }

  function startEditClaim(claim: Claim) {
    setEditingClaimId(claim.id);
    setEditEvidence(claim.evidence || "");
  }

  async function deleteStock() {
    if (!confirm("Delete this stock and all its files/notes/claims?")) return;
    await fetch(`/api/stocks/${ticker}`, { method: "DELETE" });
    router.push("/");
  }

  if (!stock) {
    return <div className="text-muted text-center py-20">Loading...</div>;
  }

  const existingTags = Array.from(
    new Set(stock.entries.map((e) => e.tag).filter(Boolean))
  ) as string[];

  const isImage = (type: string) => ["jpg", "jpeg", "png", "gif", "webp"].includes(type);
  const isPdf = (type: string) => type === "pdf";

  const timeline = [
    ...stock.files.map((f) => ({ type: "file" as const, date: f.createdAt, data: f })),
    ...stock.entries.map((e) => ({ type: "entry" as const, date: e.createdAt, data: e })),
    ...stock.relationships.map((r) => ({
      type: "relationship" as const,
      date: r.createdAt,
      data: r,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-fg">${stock.ticker}</h1>
            {(() => {
              const stance = parseStance(stock.summary);
              return stance ? (
                <span className={`text-xs border rounded-full px-3 py-1 ${STANCE_COLORS[stance]}`}>
                  {stance}
                </span>
              ) : null;
            })()}
            {stock.sector && (
              <span className="text-xs bg-surface border border-border rounded-full px-3 py-0.5 text-muted">
                {stock.sector}
              </span>
            )}
          </div>
          {stock.name && <p className="text-muted mt-1">{stock.name}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/stocks/${ticker}/edit`)}
            className="border border-border text-muted px-4 py-1.5 rounded-lg text-sm hover:text-fg hover:border-fg/30 transition"
          >
            Edit
          </button>
          <button
            onClick={deleteStock}
            className="border border-red-900 text-red-400 px-4 py-1.5 rounded-lg text-sm hover:bg-red-900/20 transition"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {(["overview", "all", "files", "notes", "claims", "relationships"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm capitalize border-b-2 transition ${tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"}`}
          >
            {t === "relationships" ? "Map" : t === "overview" ? "Overview" : t}{" "}
            {t === "overview"
              ? ""
              : t === "all"
                ? `(${timeline.length})`
                : t === "files"
                  ? `(${stock.files.length})`
                  : t === "notes"
                    ? `(${stock.entries.length})`
                    : t === "claims"
                      ? `(${stock.claims.length})`
                      : `(${stock.relationships.length})`}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Row 1: Stance + Claim Health */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <StanceCard
                summary={stock.summary}
                lastSummaryAt={stock.lastSummaryAt}
                needsSummary={needsSummary}
                summarizing={summarizing}
                summaryError={summaryError}
                onSummarize={handleSummarize}
              />
            </div>
            <div>
              <ClaimHealth
                claims={stock.claims}
                currentFilter={statusFilter}
                onFilterClick={(status) => {
                  setStatusFilter(status);
                  setTab("claims");
                }}
              />
            </div>
          </div>

          {/* Row 2: Research Priorities */}
          <ErrorBoundary>
            <ResearchPriorities
              claims={stock.claims}
              ticker={ticker}
              onVerify={handleVerifyClaim}
              verifyingClaimId={verifyingClaimId}
            />
          </ErrorBoundary>

          {/* Row 3: Key Relationships + Contrarian Angles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <KeyRelationships
              relationships={stock.relationships}
              onViewAll={() => setTab("relationships")}
            />
            <ContrarianAngles relationships={stock.relationships} />
          </div>

          {/* Row 4: Bottom Line */}
          <BottomLine summary={stock.summary} />

          {/* Row 4.5: Thesis Drift */}
          <ErrorBoundary>
            <ThesisDrift
              summary={stock.summary}
              ticker={ticker}
              resolvedClaimCount={
                stock.claims.filter(
                  (c) =>
                    c.status === "supported" || c.status === "refuted" || c.status === "disputed"
                ).length
              }
            />
          </ErrorBoundary>

          {/* Row 4.6: Research Plan */}
          <ErrorBoundary>
            <ResearchPlan ticker={ticker} />
          </ErrorBoundary>

          {/* Row 5: Recent Activity */}
          <RecentActivity timeline={timeline} />
        </div>
      )}

      {/* Tab: Files */}
      {tab === "files" && (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleUpload(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition mb-6 ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-muted"}`}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <p className="text-muted text-sm">
              {uploading ? "Uploading..." : "Drop .md or .txt files here (or click)"}
            </p>
            <p className="text-muted/50 text-xs mt-1">
              PDFs, DOCX, images, audio, spreadsheets, HTML — all converted to Markdown
              automatically
            </p>
          </div>

          {/* URL Paste */}
          <div className="bg-surface border border-border rounded-xl p-4 mb-6">
            <p className="text-xs text-muted mb-2 uppercase tracking-wide">Paste URL</p>
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlConvert()}
                placeholder="https://example.com/article-or-report"
                className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-muted/50"
              />
              <button
                onClick={handleUrlConvert}
                disabled={convertingUrl || !urlInput.trim()}
                className="bg-accent text-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50 whitespace-nowrap"
              >
                {convertingUrl ? "Converting..." : "Convert & Save"}
              </button>
            </div>
            {urlError && <p className="text-red-400 text-xs mt-2">{urlError}</p>}
          </div>

          {stock.files.length === 0 ? (
            <p className="text-muted text-center py-10">No files uploaded yet</p>
          ) : (
            <div className="space-y-3">
              {stock.files.map((file) => (
                <div key={file.id} className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs bg-bg border rounded px-2 py-0.5 uppercase ${["md", "txt"].includes(file.fileType) ? "border-accent/30 text-accent" : "border-border text-muted"}`}
                        >
                          {file.fileType}
                        </span>
                        <a
                          href={`/uploads/${ticker}/${file.filename}`}
                          target="_blank"
                          className="text-fg text-sm font-medium hover:text-accent transition truncate"
                        >
                          {file.originalName}
                        </a>
                        {file.markdown ? (
                          <span
                            className="text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2 py-0.5"
                            title="LLM-readable — will be included in Run Summary"
                          >
                            AI-ready
                          </span>
                        ) : (
                          <span
                            className="text-xs bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded-full px-2 py-0.5"
                            title="Not converted — will NOT be read by the LLM. Re-upload if it's a PDF, DOCX, image, or other format."
                          >
                            not indexed
                          </span>
                        )}
                      </div>
                      <p className="text-muted text-xs mt-1">
                        {formatBytes(file.fileSize)} · {timeAgo(file.createdAt)}
                      </p>
                      {file.description && (
                        <p className="text-fg/70 text-sm mt-2">{file.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteFile(file.id)}
                      className="text-muted hover:text-red-400 text-sm ml-4 transition"
                    >
                      ✕
                    </button>
                  </div>
                  {isImage(file.fileType) && (
                    <img
                      src={`/uploads/${ticker}/${file.filename}`}
                      alt={file.originalName}
                      className="mt-3 max-h-64 rounded-lg border border-border"
                    />
                  )}
                  {isPdf(file.fileType) && (
                    <iframe
                      src={`/uploads/${ticker}/${file.filename}`}
                      className="mt-3 w-full h-96 rounded-lg border border-border"
                      title={file.originalName}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Notes */}
      {tab === "notes" && (
        <div>
          {stock.notes && (
            <div className="bg-surface border border-border rounded-xl p-5 mb-6">
              <p className="text-xs text-muted mb-2 uppercase tracking-wide">General Notes</p>
              <p className="text-fg text-sm whitespace-pre-wrap">{stock.notes}</p>
            </div>
          )}

          <button
            onClick={() => setShowNoteForm(true)}
            className="bg-accent text-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition mb-6"
          >
            + Add Note
          </button>

          {showNoteForm && (
            <div className="bg-surface border border-border rounded-xl p-5 mb-6 space-y-4">
              <input
                type="text"
                placeholder="Title (optional)"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50 text-sm"
              />
              <textarea
                placeholder="Write your note..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={5}
                className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50 text-sm resize-none"
              />
              <input
                type="text"
                placeholder="Tag (optional, e.g. thesis, prediction)"
                value={noteTag}
                onChange={(e) => setNoteTag(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50 text-sm"
                list="tag-suggestions"
              />
              {existingTags.length > 0 && (
                <datalist id="tag-suggestions">
                  {existingTags.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              )}
              <div className="flex gap-2">
                <button
                  onClick={saveNote}
                  disabled={savingNote || !noteContent.trim()}
                  className="bg-accent text-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50"
                >
                  {savingNote ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => {
                    setShowNoteForm(false);
                    setNoteTitle("");
                    setNoteContent("");
                    setNoteTag("");
                  }}
                  className="border border-border text-muted px-4 py-2 rounded-lg text-sm hover:text-fg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {stock.entries.length === 0 ? (
            <p className="text-muted text-center py-10">No notes yet</p>
          ) : (
            <div className="space-y-4">
              {stock.entries.map((entry) => (
                <div key={entry.id} className="bg-surface border border-border rounded-xl p-5">
                  {editingId === entry.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm"
                        placeholder="Title"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={4}
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm resize-none"
                      />
                      <input
                        type="text"
                        value={editTag}
                        onChange={(e) => setEditTag(e.target.value)}
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm"
                        placeholder="Tag"
                        list="tag-suggestions-edit"
                      />
                      {existingTags.length > 0 && (
                        <datalist id="tag-suggestions-edit">
                          {existingTags.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(entry.id)}
                          className="bg-accent text-bg px-3 py-1.5 rounded text-sm font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="border border-border text-muted px-3 py-1.5 rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          {entry.title && (
                            <h3 className="text-fg font-medium text-sm">{entry.title}</h3>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {entry.tag && (
                              <span className="text-xs bg-bg border border-border rounded-full px-2.5 py-0.5 text-accent">
                                {entry.tag}
                              </span>
                            )}
                            <span className="text-muted text-xs">{timeAgo(entry.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(entry)}
                            className="text-muted hover:text-fg text-xs transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            className="text-muted hover:text-red-400 text-xs transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <p className="text-fg/80 text-sm mt-3 whitespace-pre-wrap">{entry.content}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Claims */}
      {tab === "claims" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted">
                {stock.claims.filter((c) => c.status === "supported").length} verified ·{" "}
                {stock.claims.filter((c) => c.status === "refuted").length} refuted ·{" "}
                {stock.claims.filter((c) => c.status === "unverified").length} unchecked
              </p>
              {statusFilter && (
                <button
                  onClick={() => setStatusFilter(null)}
                  className="text-xs text-accent hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport("csv")}
                className="text-xs border border-border text-muted px-2 py-1 rounded hover:text-fg transition"
                title="Export claims as CSV"
              >
                CSV
              </button>
              <button
                onClick={() => handleExport("md")}
                className="text-xs border border-border text-muted px-2 py-1 rounded hover:text-fg transition"
                title="Export claims as Markdown"
              >
                MD
              </button>
              {stock.claims.length >= 2 && (
                <button
                  onClick={handleFindDuplicates}
                  disabled={findingDuplicates}
                  className={`text-xs px-2 py-1 rounded transition ${
                    findingDuplicates
                      ? "text-muted cursor-wait"
                      : "border border-border text-muted hover:text-fg"
                  }`}
                >
                  {findingDuplicates ? "Scanning..." : "Find Dups"}
                </button>
              )}
              {stock.claims.filter((c) => c.status === "unverified").length > 0 && (
                <button
                  onClick={handleVerifyAll}
                  disabled={batchVerifying}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                    batchVerifying
                      ? "border border-border text-muted cursor-wait"
                      : "bg-accent text-bg hover:bg-accent/90"
                  }`}
                >
                  {batchVerifying
                    ? `Verifying ${batchProgress.done}/${batchProgress.total}...`
                    : `Verify All (${stock.claims.filter((c) => c.status === "unverified").length})`}
                </button>
              )}
            </div>
          </div>

          {/* Duplicate groups */}
          {dupGroups.length > 0 && (
            <div className="mb-4 bg-amber-400/5 border border-amber-400/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-amber-400 font-medium">
                  {dupGroups.length} potential duplicate group
                  {dupGroups.length !== 1 ? "s" : ""} found (word overlap &gt; 50%)
                </p>
                <button
                  onClick={() => setDupGroups([])}
                  className="text-muted hover:text-fg text-xs transition"
                >
                  Dismiss
                </button>
              </div>
              <div className="space-y-3">
                {dupGroups.map((g, gi) => (
                  <div key={gi} className="bg-bg rounded-lg p-3 border border-border">
                    <p className="text-muted/60 text-xs mb-2">
                      {g.similarity}% similar · {g.claimIds.length} claims
                    </p>
                    <div className="space-y-1.5">
                      {g.texts.map((t, ti) => (
                        <div key={ti} className="flex items-start gap-2 text-sm">
                          <span className="text-muted text-xs mt-0.5">{ti + 1}.</span>
                          <p className="text-fg/80 flex-1">{t}</p>
                          {ti > 0 && (
                            <button
                              onClick={() => handleMergeDuplicates(g.claimIds[0], [g.claimIds[ti]])}
                              className="text-accent text-xs hover:underline shrink-0"
                            >
                              Merge into #1
                            </button>
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
            <p className="text-muted text-center py-10">
              No claims yet. Sync tweets to extract claims.
            </p>
          ) : (
            <div className="space-y-3">
              {stock.claims
                .filter((c) => !statusFilter || c.status === statusFilter)
                .map((claim) => (
                  <div key={claim.id} className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => cycleClaimStatus(claim)}
                        className={`text-xs border rounded-full px-2.5 py-1 whitespace-nowrap mt-0.5 transition hover:opacity-80 ${CLAIM_COLORS[claim.status]}`}
                        title="Click to cycle: unverified → supported → refuted → disputed"
                      >
                        {claim.status}
                      </button>
                      {/* Low-confidence extraction warning */}
                      {"confidence" in claim &&
                        (claim as any).confidence != null &&
                        (claim as any).confidence <= 2 && (
                          <span
                            className="text-xs bg-yellow-900/30 text-yellow-400 border border-yellow-700 rounded-full px-2 py-0.5 whitespace-nowrap mt-0.5"
                            title={`AI confidence: ${(claim as any).confidence}/5 — may be inaccurate`}
                          >
                            ⚠️ low conf
                          </span>
                        )}
                      <div className="flex-1 min-w-0">
                        <p className="text-fg text-sm">{claim.text}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {claim.source && (
                            <span className="text-muted text-xs">{claim.source}</span>
                          )}
                          <button
                            onClick={() => startEditClaim(claim)}
                            className="text-muted hover:text-fg text-xs transition"
                          >
                            {claim.evidence ? "Edit evidence" : "+ Add evidence"}
                          </button>
                          <button
                            onClick={() => handleVerifyClaim(claim.id)}
                            disabled={verifyingClaimId === claim.id}
                            className={`text-xs px-2.5 py-1 rounded border transition ${
                              verifyingClaimId === claim.id
                                ? "border-border text-muted cursor-wait"
                                : "border-accent/30 text-accent hover:bg-accent/10"
                            }`}
                          >
                            {verifyingClaimId === claim.id ? "Verifying..." : "🔍 Verify"}
                          </button>
                        </div>

                        {editingClaimId === claim.id ? (
                          <div className="mt-3 space-y-3">
                            <textarea
                              value={editEvidence}
                              onChange={(e) => setEditEvidence(e.target.value)}
                              placeholder="Paste links, notes, or data that supports or refutes this claim..."
                              rows={3}
                              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm resize-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveClaimEvidence(claim.id)}
                                className="bg-accent text-bg px-3 py-1.5 rounded text-xs font-medium"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingClaimId(null)}
                                className="border border-border text-muted px-3 py-1.5 rounded text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : claim.evidence ? (
                          <p className="text-fg/70 text-xs mt-2 whitespace-pre-wrap bg-bg rounded-lg p-3 border border-border">
                            {claim.evidence}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Relationships (Mind Map) */}
      {tab === "relationships" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-muted">
                {
                  stock.relationships.filter(
                    (r) => r.section === "map" && r.confidence === "confirmed"
                  ).length
                }{" "}
                confirmed ·{" "}
                {
                  stock.relationships.filter(
                    (r) => r.section === "map" && r.confidence === "speculative"
                  ).length
                }{" "}
                speculative ·{" "}
                {
                  stock.relationships.filter((r) => r.section === "map" && r.confidence === "gap")
                    .length
                }{" "}
                gaps · {stock.relationships.filter((r) => r.section === "contrarian").length}{" "}
                contrarian
              </p>
            </div>
            <button
              onClick={handleReMap}
              disabled={remapping}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                stock.relationships.length === 0
                  ? "bg-accent text-bg hover:bg-accent/90"
                  : "border border-border text-muted hover:text-fg hover:border-fg/30"
              } disabled:opacity-50`}
            >
              {remapping
                ? "Mapping..."
                : stock.relationships.length === 0
                  ? "Map Relationships"
                  : "Re-map"}
            </button>
          </div>

          {remapError && <p className="text-red-400 text-xs mb-3">{remapError}</p>}

          {stock.extractionError && (
            <div className="flex items-start justify-between gap-3 bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4">
              <div>
                <p className="text-red-400 text-xs font-medium mb-0.5">
                  Relationship extraction failed
                </p>
                <p className="text-red-400/70 text-xs">{stock.extractionError}</p>
              </div>
              <button
                onClick={dismissExtractionError}
                className="text-red-400/60 hover:text-red-400 text-xs transition shrink-0"
              >
                ✕ Dismiss
              </button>
            </div>
          )}

          {stock.relationships.length === 0 ? (
            <p className="text-muted text-center py-10">
              No relationship map yet. Click &quot;Map Relationships&quot; to let the AI discover
              connections.
            </p>
          ) : (
            (() => {
              const mapRelationships = stock.relationships.filter(
                (r) => r.section !== "contrarian"
              );
              const contrarianAngles = stock.relationships.filter(
                (r) => r.section === "contrarian"
              );

              // Group map relationships by type
              const grouped = new Map<string, Relationship[]>();
              for (const r of mapRelationships) {
                if (!grouped.has(r.type)) grouped.set(r.type, []);
                grouped.get(r.type)!.push(r);
              }

              const confidenceClass = (c: string) =>
                c === "confirmed"
                  ? "border-emerald-400/40 bg-emerald-400/5"
                  : c === "speculative"
                    ? "border-amber-400/30 bg-amber-400/5 border-dashed"
                    : "border-slate-500/30 bg-slate-500/5 border-dotted";

              const confidenceBadge = (c: string) =>
                c === "confirmed"
                  ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/10"
                  : c === "speculative"
                    ? "text-amber-400 border-emerald-400/20 bg-amber-400/10"
                    : "text-slate-400 border-slate-400/20 bg-slate-400/10";

              const confidenceLabel = (c: string) =>
                c === "confirmed" ? "✓" : c === "speculative" ? "?" : "⟳ research";

              const confidenceDot = (c: string) =>
                c === "confirmed"
                  ? "border-emerald-400 bg-emerald-400/20"
                  : c === "speculative"
                    ? "border-amber-400 bg-amber-400/20"
                    : "border-slate-500 bg-slate-500/20";

              return (
                <div className="space-y-6">
                  {/* Mind Map section */}
                  {mapRelationships.length > 0 && (
                    <div className="space-y-8">
                      {Array.from(grouped.entries()).map(([type, items]) => (
                        <div key={type}>
                          <h3 className="text-xs text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-accent" />
                            {type}
                            <span className="text-muted/50">({items.length})</span>
                          </h3>

                          <div className="relative pl-6 border-l-2 border-border space-y-3">
                            {items.map((r) => (
                              <div
                                key={r.id}
                                className={`relative rounded-lg border p-4 ${confidenceClass(r.confidence)}`}
                              >
                                <div
                                  className={`absolute -left-[25px] top-4 w-3 h-3 rounded-full border-2 ${confidenceDot(r.confidence)}`}
                                />

                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-fg text-sm font-medium">
                                        {r.target}
                                      </span>
                                      <span
                                        className={`text-[10px] border rounded-full px-2 py-0.5 ${confidenceBadge(r.confidence)}`}
                                      >
                                        {confidenceLabel(r.confidence)}
                                      </span>
                                    </div>
                                    {r.description && (
                                      <p className="text-fg/70 text-xs leading-relaxed">
                                        {r.description}
                                      </p>
                                    )}
                                    {r.sources && (
                                      <p className="text-muted/60 text-[10px] mt-2 font-mono">
                                        {r.sources}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contrarian / Outside the Box section */}
                  {contrarianAngles.length > 0 && (
                    <div className="border-t border-border pt-8 mt-8">
                      <div className="flex items-center gap-3 mb-5">
                        <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">
                          💡 Outside the Box
                        </h2>
                        <span className="text-xs text-muted">
                          Contrarian angles — challenge assumptions, explore blind spots
                        </span>
                      </div>

                      <div className="relative pl-6 border-l-2 border-purple-400/30 space-y-3">
                        {contrarianAngles.map((a) => (
                          <div
                            key={a.id}
                            className="relative rounded-lg border border-purple-400/20 bg-purple-400/5 p-4"
                          >
                            <div className="absolute -left-[25px] top-4 w-3 h-3 rounded-full border-2 border-purple-400 bg-purple-400/20" />

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] uppercase text-purple-400/70 border border-purple-400/20 rounded-full px-2 py-0.5">
                                  {a.type}
                                </span>
                                <span className="text-fg text-sm font-medium">{a.target}</span>
                              </div>
                              {a.description && (
                                <p className="text-fg/70 text-xs leading-relaxed mt-1">
                                  {a.description}
                                </p>
                              )}
                              {a.sources && (
                                <p className="text-muted/60 text-[10px] mt-2 font-mono">
                                  {a.sources}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Tab: All */}
      {tab === "all" && (
        <div>
          {timeline.length === 0 ? (
            <p className="text-muted text-center py-10">Nothing yet. Add a file or note.</p>
          ) : (
            <div className="relative pl-6 border-l border-border space-y-6">
              {timeline.map((item, i) => (
                <div key={i} className="relative">
                  <div
                    className={`absolute -left-[31px] w-3 h-3 rounded-full border-2 ${
                      item.type === "file"
                        ? "border-blue-400 bg-blue-400/20"
                        : item.type === "relationship"
                          ? "border-purple-400 bg-purple-400/20"
                          : "border-accent bg-accent/20"
                    }`}
                  />
                  {item.type === "file" ? (
                    <div className="bg-surface border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-bg border border-border rounded px-2 py-0.5 text-muted uppercase">
                          {item.data.fileType}
                        </span>
                        <a
                          href={`/uploads/${ticker}/${item.data.filename}`}
                          target="_blank"
                          className="text-fg text-sm font-medium hover:text-accent transition"
                        >
                          {item.data.originalName}
                        </a>
                        <span className="text-muted text-xs ml-auto">
                          {timeAgo(item.data.createdAt)}
                        </span>
                      </div>
                    </div>
                  ) : item.type === "relationship" ? (
                    <div className="bg-surface border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-purple-400 uppercase">Relation</span>
                        <span className="text-xs bg-bg border border-border rounded-full px-2 py-0.5 text-muted">
                          {item.data.type}
                        </span>
                        <span className="text-muted text-xs ml-auto">
                          {timeAgo(item.data.createdAt)}
                        </span>
                      </div>
                      <span className="text-fg text-sm font-medium">{item.data.target}</span>
                      {item.data.description && (
                        <p className="text-fg/70 text-xs mt-1 line-clamp-2">
                          {item.data.description}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="bg-surface border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-accent">Note</span>
                        {item.data.tag && (
                          <span className="text-xs bg-bg border border-border rounded-full px-2 py-0.5 text-accent">
                            {item.data.tag}
                          </span>
                        )}
                        <span className="text-muted text-xs ml-auto">
                          {timeAgo(item.data.createdAt)}
                        </span>
                      </div>
                      {item.data.title && (
                        <p className="text-fg font-medium text-sm">{item.data.title}</p>
                      )}
                      <p className="text-fg/70 text-sm mt-1 whitespace-pre-wrap line-clamp-3">
                        {item.data.content}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
