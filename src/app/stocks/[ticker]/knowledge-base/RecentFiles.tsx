"use client";

import { useEffect, useState, useCallback } from "react";
import UploadZone from "./UploadZone";
import { timeAgo } from "@/lib/db";

interface FileData {
  id: number;
  filename: string;
  originalName: string;
  fileType: string;
  markdown: string | null;
  createdAt: string;
}

interface Props {
  ticker: string;
  onOpenManager: () => void;
}

export default function RecentFiles({ ticker, onOpenManager }: Props) {
  const [files, setFiles] = useState<FileData[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/stocks/${ticker}/files`)
      .then((r) => r.json())
      .then((data) => setFiles(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [ticker]);

  useEffect(() => {
    load();
  }, [load]);

  const recent = files.slice(0, 4);

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-fg">📄 Documents</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="text-xs text-accent hover:text-fg transition"
          >
            {showUpload ? "Cancel" : "+ Upload"}
          </button>
          {files.length > 0 && (
            <button
              onClick={onOpenManager}
              className="text-xs text-muted hover:text-fg transition"
            >
              Manage all →
            </button>
          )}
        </div>
      </div>

      {/* Upload toggle */}
      {showUpload && (
        <div className="mb-3">
          <UploadZone
            ticker={ticker}
            onUploaded={() => {
              load();
              setShowUpload(false);
            }}
            compact
          />
        </div>
      )}

      {/* File strip */}
      {recent.length === 0 ? (
        <p className="text-xs text-muted/40">
          No documents yet. Upload PDFs, DOCX, images — auto-converted for the AI.
        </p>
      ) : (
        <div className="space-y-1.5">
          {recent.map((f) => (
            <a
              key={f.id}
              href={`/uploads/${ticker}/${f.filename}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-fg/70 hover:text-fg bg-bg/50 border border-border/50 rounded-lg px-3 py-1.5 transition group"
            >
              <span className="text-muted">📄</span>
              <span className="flex-1 truncate">{f.originalName}</span>
              {f.markdown ? (
                <span className="text-[10px] bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-1.5 py-0.5 shrink-0">
                  AI-ready
                </span>
              ) : (
                <span className="text-[10px] bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded-full px-1.5 py-0.5 shrink-0">
                  not indexed
                </span>
              )}
              <span className="text-[10px] text-muted/50 shrink-0">
                {timeAgo(f.createdAt)}
              </span>
            </a>
          ))}
          {files.length > 4 && (
            <button
              onClick={onOpenManager}
              className="w-full text-xs text-muted hover:text-fg text-center py-1 transition"
            >
              +{files.length - 4} more files — manage all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
