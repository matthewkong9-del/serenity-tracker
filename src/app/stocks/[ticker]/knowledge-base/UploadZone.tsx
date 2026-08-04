"use client";

import { useState, useRef } from "react";

interface Props {
  ticker: string;
  onUploaded: () => void;
  compact?: boolean;
}

/**
 * Shared drag-and-drop file upload zone.
 * Used by both RecentFiles (compact mode) and FileManager (full mode).
 */
export default function UploadZone({ ticker, onUploaded, compact }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError("");

    const files = Array.from(fileList);
    let ok = 0;
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/stocks/${ticker}/files`, {
          method: "POST",
          body: fd,
        });
        if (res.ok) ok++;
        else {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }
      } catch (e: any) {
        if (files.length === 1) setError(e.message);
      }
    }

    setUploading(false);
    if (files.length > 1 && ok < files.length) {
      setError(`${ok}/${files.length} files uploaded — some failed`);
    }
    if (ok > 0) onUploaded();
  }

  const padding = compact ? "p-3" : "p-6";
  const text = compact ? "text-xs" : "text-sm";
  const hint = compact ? "text-[10px]" : "text-xs";

  return (
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
        className={`border-2 border-dashed rounded-xl ${padding} text-center cursor-pointer transition ${
          dragOver
            ? "border-accent bg-accent/5"
            : "border-border hover:border-muted"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        {uploading ? (
          <p className={`${text} text-accent animate-pulse`}>Uploading...</p>
        ) : (
          <>
            <p className={`${text} text-muted`}>
              Drop files or click to upload
            </p>
            {!compact && (
              <p className={`${hint} text-muted/50 mt-1`}>
                PDFs, DOCX, images, audio — auto-converted to Markdown
              </p>
            )}
          </>
        )}
      </div>
      {error && (
        <p className="text-[10px] text-red-400 mt-1.5">{error}</p>
      )}
    </div>
  );
}
