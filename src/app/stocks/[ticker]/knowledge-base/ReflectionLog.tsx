"use client";

import { useEffect, useState, useCallback } from "react";
import { timeAgo } from "@/lib/db";

interface Annotation {
  id: number;
  section: string | null;
  text: string;
  aiFlag: string | null;
  aiCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const SECTION_LABELS: Record<string, string> = {
  what: "What They Do",
  chokepoint: "The Chokepoint",
  numbers: "The Numbers That Matter",
  risk: "What Could Go Wrong",
  bottom: "The Bottom Line",
};

interface Props {
  ticker: string;
}

export default function ReflectionLog({ ticker }: Props) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [newText, setNewText] = useState("");
  const [newSection, setNewSection] = useState("");
  const [saving, setSaving] = useState(false);
  const [studyChecking, setStudyChecking] = useState(false);
  const [studyResult, setStudyResult] = useState("");

  const fetchAnnotations = useCallback(async () => {
    try {
      const res = await fetch(`/api/stocks/${ticker}/annotations`);
      if (res.ok) setAnnotations(await res.json());
    } catch {/* silent */}
  }, [ticker]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/stocks/${ticker}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: newText.trim(),
          section: newSection || null,
        }),
      });
      if (res.ok) {
        setNewText("");
        setNewSection("");
        fetchAnnotations();
      }
    } catch {/* silent */} finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/stocks/${ticker}/annotations/${id}`, { method: "DELETE" });
      fetchAnnotations();
    } catch {/* silent */}
  };

  const handleStudyCheck = async () => {
    setStudyChecking(true);
    setStudyResult("");
    try {
      const res = await fetch(`/api/stocks/${ticker}/questions/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        const parts: string[] = [];
        if (data.newQuestions > 0) parts.push(`${data.newQuestions} new questions`);
        if (data.staleFlagged > 0) parts.push(`${data.staleFlagged} answers flagged stale`);
        if (data.reflectionsFlagged > 0) parts.push(`${data.reflectionsFlagged} reflections flagged`);
        setStudyResult(parts.length > 0 ? parts.join(" · ") : "✓ Nothing new to flag");
        fetchAnnotations(); // refresh to show any new AI flags
      } else {
        setStudyResult(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setStudyResult(`Error: ${e.message}`);
    } finally {
      setStudyChecking(false);
    }
  };

  // Counts
  const freestyle = annotations.filter((a) => !a.section);
  const sectioned = annotations.filter((a) => a.section);
  const flaggedCount = annotations.filter((a) => a.aiFlag).length;

  // Group sectioned annotations
  const grouped: Record<string, Annotation[]> = {};
  for (const a of sectioned) {
    const key = a.section || "general";
    (grouped[key] ||= []).push(a);
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-fg">📝 Reflection Log</h3>
          <p className="text-[10px] text-muted/50 mt-0.5">
            {freestyle.length} reflections
            {flaggedCount > 0 && ` · ${flaggedCount} flagged`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleStudyCheck}
            disabled={studyChecking}
            className="text-xs text-accent hover:text-fg transition disabled:opacity-50"
          >
            {studyChecking ? "Checking..." : "🧠 Study Check"}
          </button>
        </div>
      </div>

      {/* Study check result */}
      {studyResult && (
        <div className="mb-3 bg-bg border border-border rounded-lg px-3 py-2 text-xs text-fg/70">
          {studyResult}
        </div>
      )}

      {/* Composer */}
      <div className="mb-4 p-3 bg-bg border border-border/50 rounded-lg space-y-2">
        <textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="What did you learn or realize? Write anything..."
          className="w-full bg-surface border border-border rounded px-3 py-2 text-xs text-fg placeholder-muted/40 resize-y min-h-[60px]"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <div className="flex items-center gap-2">
          <select
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            className="bg-surface border border-border rounded px-2 py-1 text-xs text-fg"
          >
            <option value="">Journal (general)</option>
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-muted/30">
            Optional — tag a narrative section
          </span>
          <button
            onClick={handleAdd}
            disabled={saving || !newText.trim()}
            className="ml-auto text-xs bg-accent text-bg px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Sectioned annotations (margin notes) */}
      {Object.entries(grouped).map(([section, notes]) => (
        <div key={section} className="mb-3 last:mb-0">
          <div className="text-[10px] font-medium text-muted/50 uppercase tracking-wider mb-1.5">
            {SECTION_LABELS[section] || section}
          </div>
          <div className="space-y-1.5">
            {notes.map((a) => (
              <div
                key={a.id}
                className="group flex items-start gap-2 bg-bg/50 border border-border/50 rounded-lg px-3 py-2 text-xs text-fg/70 hover:border-border transition"
              >
                <span className="flex-1 leading-relaxed">{a.text}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <span className="text-[10px] text-muted/30">
                    {timeAgo(a.createdAt)}
                  </span>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-[10px] text-red-400/50 hover:text-red-400 transition"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Freestyle reflections (timeline, newest first) */}
      {freestyle.length > 0 && (
        <div className={sectioned.length > 0 ? "mt-4 pt-4 border-t border-border" : ""}>
          <div className="text-[10px] font-medium text-muted/50 uppercase tracking-wider mb-2">
            Journal
          </div>
          <div className="space-y-2">
            {freestyle.map((a) => (
              <div
                key={a.id}
                className="group bg-bg/50 border border-border/50 rounded-lg px-3 py-2 hover:border-border transition"
              >
                {/* AI flag banner */}
                {a.aiFlag && (
                  <div className="mb-2 bg-amber-400/5 border border-amber-400/10 rounded px-2 py-1 text-[10px] text-amber-400/80">
                    🧠 {a.aiFlag}
                  </div>
                )}

                <p className="text-xs text-fg/70 leading-relaxed">{a.text}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted/30">
                      {timeAgo(a.createdAt)}
                    </span>
                    {a.aiCheckedAt && (
                      <span className="text-[10px] text-muted/20">
                        checked {timeAgo(a.aiCheckedAt)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-[10px] text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {annotations.length === 0 && (
        <p className="text-xs text-muted/40">
          No reflections yet. Write what you learn — the AI study pal will track your understanding.
        </p>
      )}
    </div>
  );
}
