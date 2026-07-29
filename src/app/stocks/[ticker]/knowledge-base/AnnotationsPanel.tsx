"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/db";

interface Annotation {
  id: number;
  section: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

const SECTION_KEYS: Record<string, string> = {
  "What They Do": "what",
  "The Chokepoint": "chokepoint",
  "The Numbers That Matter": "numbers",
  "What Could Go Wrong": "risk",
  "The Bottom Line": "bottom",
};

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

export default function AnnotationsPanel({ ticker }: Props) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [newSection, setNewSection] = useState("what");
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchAnnotations = async () => {
    try {
      const res = await fetch(`/api/stocks/${ticker}/annotations`);
      if (res.ok) setAnnotations(await res.json());
    } catch {/* silent */}
  };

  useEffect(() => {
    fetchAnnotations();
  }, [ticker]);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/stocks/${ticker}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: newSection, text: newText.trim() }),
      });
      if (res.ok) {
        setNewText("");
        setAdding(false);
        fetchAnnotations();
      }
    } catch {/* silent */} finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch(`/api/stocks/${ticker}/annotations/${id}`, { method: "DELETE" });
      fetchAnnotations();
    } catch {/* silent */} finally {
      setDeleting(null);
    }
  };

  const grouped: Record<string, Annotation[]> = {
    what: annotations.filter((a) => a.section === "what"),
    chokepoint: annotations.filter((a) => a.section === "chokepoint"),
    numbers: annotations.filter((a) => a.section === "numbers"),
    risk: annotations.filter((a) => a.section === "risk"),
    bottom: annotations.filter((a) => a.section === "bottom"),
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-fg">📝 Margin Notes</h3>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs text-accent hover:text-fg transition"
        >
          {adding ? "Cancel" : "+ Add Note"}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-4 p-3 bg-bg border border-accent/30 rounded-lg space-y-2">
          <select
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            className="w-full bg-surface border border-border rounded px-2 py-1 text-xs text-fg"
          >
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Add a research note, question, or observation..."
            className="w-full bg-surface border border-border rounded px-3 py-2 text-xs text-fg placeholder-muted/40 resize-y min-h-[60px]"
            rows={2}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newText.trim()}
              className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Grouped annotations */}
      {Object.entries(grouped).map(([section, notes]) => {
        if (notes.length === 0) return null;
        return (
          <div key={section} className="mb-3 last:mb-0">
            <div className="text-[10px] font-medium text-muted/50 uppercase tracking-wider mb-1.5">
              {SECTION_LABELS[section]}
            </div>
            <div className="space-y-1.5">
              {notes.map((a) => (
                <div
                  key={a.id}
                  className="group flex items-start gap-2 bg-bg/50 border border-border/50 rounded-lg px-3 py-2 text-xs text-fg/70 hover:border-border transition"
                >
                  <span className="flex-1 leading-relaxed">{a.text}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <span className="text-[10px] text-muted/30">{timeAgo(a.createdAt)}</span>
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={deleting === a.id}
                      className="text-[10px] text-red-400/50 hover:text-red-400 transition"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {annotations.length === 0 && !adding && (
        <p className="text-xs text-muted/40">No notes yet. Add margin notes to specific sections of the narrative.</p>
      )}
    </div>
  );
}
