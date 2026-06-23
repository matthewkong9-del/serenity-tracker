"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatBytes, timeAgo } from "@/lib/db";

interface StockFile {
  id: number;
  filename: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  description: string | null;
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

interface Stock {
  id: number;
  ticker: string;
  name: string | null;
  sector: string | null;
  notes: string | null;
  summary: string | null;
  lastSummaryAt: string | null;
  files: StockFile[];
  entries: Entry[];
}

type Tab = "files" | "notes" | "all";

export default function StockPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = params.ticker as string;
  const [stock, setStock] = useState<Stock | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const load = useCallback(() => {
    fetch(`/api/stocks/${ticker}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setStock)
      .catch(() => router.push("/"));
  }, [ticker, router]);

  useEffect(() => { load(); }, [load]);

  // LOGIC: Does the summary need updating?
  const needsSummary = stock ? 
    !stock.lastSummaryAt || 
    stock.files.some(f => new Date(f.createdAt) > new Date(stock.lastSummaryAt!)) || 
    stock.entries.some(e => new Date(e.createdAt) > new Date(stock.lastSummaryAt!))
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
    setNoteTitle(""); setNoteContent(""); setNoteTag("");
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

  async function deleteStock() {
    if (!confirm("Delete this stock and all its files/notes?")) return;
    await fetch(`/api/stocks/${ticker}`, { method: "DELETE" });
    router.push("/");
  }

  if (!stock) {
    return <div className="text-muted text-center py-20">Loading...</div>;
  }

  const isImage = (type: string) => ["jpg", "jpeg", "png", "gif", "webp"].includes(type);
  const isPdf = (type: string) => type === "pdf";

  const timeline = [
    ...stock.files.map((f) => ({ type: "file" as const, date: f.createdAt, data: f })),
    ...stock.entries.map((e) => ({ type: "entry" as const, date: e.createdAt, data: e })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-fg">${stock.ticker}</h1>
            {stock.sector && (
              <span className="text-xs bg-surface border border-border rounded-full px-3 py-0.5 text-muted">
                {stock.sector}
              </span>
            )}
          </div>
          {stock.name && <p className="text-muted mt-1">{stock.name}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push(`/stocks/${ticker}/edit`)} className="border border-border text-muted px-4 py-1.5 rounded-lg text-sm hover:text-fg hover:border-fg/30 transition">Edit</button>
          <button onClick={deleteStock} className="border border-red-900 text-red-400 px-4 py-1.5 rounded-lg text-sm hover:bg-red-900/20 transition">Delete</button>
        </div>
      </div>

      {/* AI MEMORY BLOCK */}
      <div className="bg-surface border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-accent uppercase tracking-wider">🧠 AI Memory</h2>
          <button
            onClick={handleSummarize}
            disabled={summarizing || !needsSummary}
            className={`text-sm px-4 py-1.5 rounded-lg font-medium transition ${
              needsSummary 
                ? "bg-accent text-bg hover:bg-accent/90" 
                : "bg-bg text-muted border border-border cursor-not-allowed"
            }`}
          >
            {summarizing ? "Analyzing..." : needsSummary ? "Run Summary" : "Up to date ✓"}
          </button>
        </div>
        
        {summaryError && <p className="text-red-400 text-sm mb-2">{summaryError}</p>}

        {stock.summary ? (
          <div className="prose prose-invert prose-sm max-w-none text-fg/80 whitespace-pre-wrap">
            {stock.summary}
          </div>
        ) : (
          <p className="text-muted text-sm">
            {needsSummary ? "New data available. Click 'Run Summary' to generate." : "Add notes or .md files to generate a summary."}
          </p>
        )}
        
        {stock.lastSummaryAt && (
          <p className="text-muted/50 text-xs mt-3 border-t border-border pt-2">
            Last summarized: {new Date(stock.lastSummaryAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* General Notes */}
      {stock.notes && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-6">
          <p className="text-xs text-muted mb-2 uppercase tracking-wide">General Notes</p>
          <p className="text-fg text-sm whitespace-pre-wrap">{stock.notes}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {(["all", "files", "notes"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm capitalize border-b-2 transition ${tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"}`}>
            {t} {t === "all" ? `(${timeline.length})` : t === "files" ? `(${stock.files.length})` : `(${stock.entries.length})`}
          </button>
        ))}
      </div>

      {/* Tab: Files */}
      {tab === "files" && (
        <div>
          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()} className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition mb-6 ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-muted"}`}>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
            <p className="text-muted text-sm">{uploading ? "Uploading..." : "Drop .md or .txt files here (or click)"}</p>
            <p className="text-muted/50 text-xs mt-1">For AI memory, Markdown (.md) is ideal</p>
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
                        <span className={`text-xs bg-bg border rounded px-2 py-0.5 uppercase ${["md", "txt"].includes(file.fileType) ? "border-accent/30 text-accent" : "border-border text-muted"}`}>
                          {file.fileType}
                        </span>
                        <a href={`/uploads/${ticker}/${file.filename}`} target="_blank" className="text-fg text-sm font-medium hover:text-accent transition truncate">{file.originalName}</a>
                      </div>
                      <p className="text-muted text-xs mt-1">{formatBytes(file.fileSize)} · {timeAgo(file.createdAt)}</p>
                      {file.description && <p className="text-fg/70 text-sm mt-2">{file.description}</p>}
                    </div>
                    <button onClick={() => deleteFile(file.id)} className="text-muted hover:text-red-400 text-sm ml-4 transition">✕</button>
                  </div>
                  {isImage(file.fileType) && <img src={`/uploads/${ticker}/${file.filename}`} alt={file.originalName} className="mt-3 max-h-64 rounded-lg border border-border" />}
                  {isPdf(file.fileType) && <iframe src={`/uploads/${ticker}/${file.filename}`} className="mt-3 w-full h-96 rounded-lg border border-border" title={file.originalName} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Notes */}
      {tab === "notes" && (
        <div>
          <button onClick={() => setShowNoteForm(true)} className="bg-accent text-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition mb-6">+ Add Note</button>

          {showNoteForm && (
            <div className="bg-surface border border-border rounded-xl p-5 mb-6 space-y-4">
              <input type="text" placeholder="Title (optional)" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50 text-sm" />
              <textarea placeholder="Write your note..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={5} className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50 text-sm resize-none" />
              <input type="text" placeholder="Tag (optional, e.g. thesis, prediction)" value={noteTag} onChange={(e) => setNoteTag(e.target.value)} className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50 text-sm" />
              <div className="flex gap-2">
                <button onClick={saveNote} disabled={savingNote || !noteContent.trim()} className="bg-accent text-bg px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50">{savingNote ? "Saving..." : "Save"}</button>
                <button onClick={() => { setShowNoteForm(false); setNoteTitle(""); setNoteContent(""); setNoteTag(""); }} className="border border-border text-muted px-4 py-2 rounded-lg text-sm hover:text-fg transition">Cancel</button>
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
                      <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm" placeholder="Title" />
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm resize-none" />
                      <input type="text" value={editTag} onChange={(e) => setEditTag(e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-fg text-sm" placeholder="Tag" />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(entry.id)} className="bg-accent text-bg px-3 py-1.5 rounded text-sm font-medium">Save</button>
                        <button onClick={() => setEditingId(null)} className="border border-border text-muted px-3 py-1.5 rounded text-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          {entry.title && <h3 className="text-fg font-medium text-sm">{entry.title}</h3>}
                          <div className="flex items-center gap-2 mt-1">
                            {entry.tag && <span className="text-xs bg-bg border border-border rounded-full px-2.5 py-0.5 text-accent">{entry.tag}</span>}
                            <span className="text-muted text-xs">{timeAgo(entry.createdAt)}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(entry)} className="text-muted hover:text-fg text-xs transition">Edit</button>
                          <button onClick={() => deleteEntry(entry.id)} className="text-muted hover:text-red-400 text-xs transition">Delete</button>
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

      {/* Tab: All */}
      {tab === "all" && (
        <div>
          {timeline.length === 0 ? (
            <p className="text-muted text-center py-10">Nothing yet. Add a file or note.</p>
          ) : (
            <div className="relative pl-6 border-l border-border space-y-6">
              {timeline.map((item, i) => (
                <div key={i} className="relative">
                  <div className={`absolute -left-[31px] w-3 h-3 rounded-full border-2 ${item.type === "file" ? "border-blue-400 bg-blue-400/20" : "border-accent bg-accent/20"}`} />
                  {item.type === "file" ? (
                    <div className="bg-surface border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-bg border border-border rounded px-2 py-0.5 text-muted uppercase">{item.data.fileType}</span>
                        <a href={`/uploads/${ticker}/${item.data.filename}`} target="_blank" className="text-fg text-sm font-medium hover:text-accent transition">{item.data.originalName}</a>
                        <span className="text-muted text-xs ml-auto">{timeAgo(item.data.createdAt)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-surface border border-border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-accent">Note</span>
                        {item.data.tag && <span className="text-xs bg-bg border border-border rounded-full px-2 py-0.5 text-accent">{item.data.tag}</span>}
                        <span className="text-muted text-xs ml-auto">{timeAgo(item.data.createdAt)}</span>
                      </div>
                      {item.data.title && <p className="text-fg font-medium text-sm">{item.data.title}</p>}
                      <p className="text-fg/70 text-sm mt-1 whitespace-pre-wrap line-clamp-3">{item.data.content}</p>
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
