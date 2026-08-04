"use client";

import { useEffect, useState, useCallback } from "react";
import UploadZone from "./UploadZone";
import { formatBytes, timeAgo } from "@/lib/db";

interface FileData {
  id: number;
  filename: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  markdown: string | null;
  createdAt: string;
}

interface Props {
  ticker: string;
}

const IMAGE_TYPES = ["jpg", "jpeg", "png", "gif", "webp"];
const PDF_TYPE = "pdf";

export default function FileManager({ ticker }: Props) {
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [converting, setConverting] = useState(false);
  const [urlError, setUrlError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/stocks/${ticker}/files`)
      .then((r) => r.json())
      .then((data) => {
        setFiles(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticker]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this file?")) return;
    await fetch(`/api/stocks/${ticker}/files/${id}`, { method: "DELETE" });
    load();
  }

  async function handleUrlConvert() {
    if (!urlInput.trim()) return;
    setConverting(true);
    setUrlError("");

    try {
      const res = await fetch("/api/convert-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Conversion failed");
      }

      const { markdown } = await res.json();
      if (!markdown) throw new Error("No content returned");

      // Upload the converted markdown as a file
      const host = new URL(urlInput.trim()).hostname;
      const blob = new Blob([markdown], { type: "text/markdown" });
      const fd = new FormData();
      fd.append("file", blob, `${host}.md`);
      const uploadRes = await fetch(`/api/stocks/${ticker}/files`, {
        method: "POST",
        body: fd,
      });

      if (uploadRes.ok) {
        setUrlInput("");
        load();
      } else {
        const data = await uploadRes.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
    } catch (e: any) {
      setUrlError(e.message);
    } finally {
      setConverting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-32 bg-bg rounded-xl" />
          <div className="h-12 bg-bg rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Upload zone */}
      <UploadZone ticker={ticker} onUploaded={load} />

      {/* URL converter */}
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste a URL to save as markdown..."
          className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-fg placeholder-muted/40"
          onKeyDown={(e) => e.key === "Enter" && handleUrlConvert()}
        />
        <button
          onClick={handleUrlConvert}
          disabled={converting || !urlInput.trim()}
          className="text-xs bg-accent text-bg px-3 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 shrink-0"
        >
          {converting ? "Converting..." : "Convert & Save"}
        </button>
      </div>
      {urlError && (
        <p className="text-[10px] text-red-400">{urlError}</p>
      )}

      {/* File list */}
      {files.length === 0 ? (
        <p className="text-xs text-muted text-center py-4">
          No documents uploaded. Drop files above or paste a URL.
        </p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {files.map((f) => (
            <div
              key={f.id}
              className="bg-surface border border-border rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {/* File type badge */}
                    <span
                      className={`text-[10px] border rounded px-1.5 py-0.5 uppercase ${
                        ["md", "txt"].includes(f.fileType)
                          ? "border-accent/30 text-accent"
                          : "border-border text-muted"
                      }`}
                    >
                      {f.fileType}
                    </span>

                    {/* Indexed status */}
                    {f.markdown ? (
                      <span className="text-[10px] bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2 py-0.5">
                        AI-ready
                      </span>
                    ) : (
                      <span className="text-[10px] bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded-full px-2 py-0.5">
                        not indexed
                      </span>
                    )}

                    {/* Download link */}
                    <a
                      href={`/uploads/${ticker}/${f.filename}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-accent hover:underline ml-auto"
                    >
                      Open
                    </a>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(f.id)}
                      className="text-[10px] text-muted hover:text-red-400 transition"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="text-xs text-fg/80 truncate font-medium">
                    {f.originalName}
                  </p>
                  <p className="text-[10px] text-muted/50 mt-0.5">
                    {formatBytes(f.fileSize)} · {timeAgo(f.createdAt)}
                  </p>
                </div>
              </div>

              {/* Image preview */}
              {IMAGE_TYPES.includes(f.fileType) && (
                <div className="mt-3 rounded-lg overflow-hidden border border-border max-w-md">
                  <img
                    src={`/uploads/${ticker}/${f.filename}`}
                    alt={f.originalName}
                    className="max-h-64 w-auto"
                  />
                </div>
              )}

              {/* PDF preview */}
              {f.fileType === PDF_TYPE && (
                <div className="mt-3">
                  <iframe
                    src={`/uploads/${ticker}/${f.filename}`}
                    className="w-full h-96 rounded-lg border border-border"
                    title={f.originalName}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
