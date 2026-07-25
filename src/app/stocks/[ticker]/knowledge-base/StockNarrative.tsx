"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";

interface Props {
  narrative: string | null;
  ticker: string;
  onSave: (text: string) => Promise<void>;
}

// ── Section config ──

interface Section {
  title: string;
  icon: string;
  content: string;
  accent: string; // border-left color
}

const SECTION_STYLES: Record<string, { icon: string; accent: string; label: string }> = {
  "what they do": {
    icon: "🏭",
    accent: "border-blue-400/40",
    label: "What They Do",
  },
  "the chokepoint": {
    icon: "🔗",
    accent: "border-amber-400/40",
    label: "The Chokepoint",
  },
  "the numbers that matter": {
    icon: "📊",
    accent: "border-green-400/40",
    label: "The Numbers That Matter",
  },
  "what could go wrong": {
    icon: "⚠️",
    accent: "border-red-400/40",
    label: "What Could Go Wrong",
  },
  "the bottom line": {
    icon: "💡",
    accent: "border-purple-400/40",
    label: "The Bottom Line",
  },
};

/**
 * Parse narrative markdown into sections based on **Section Title** headers.
 */
function parseSections(narrative: string): Section[] {
  const sections: Section[] = [];
  // Split on lines that are bold headers: **Something**
  const parts = narrative.split(/^(?=\*\*[^*]+\*\*$)/m);

  for (const part of parts) {
    const match = part.match(/^\*\*([^*]+)\*\*\s*\n?/);
    if (match) {
      const title = match[1].trim();
      const content = part.slice(match[0].length).trim();
      const key = title.toLowerCase();
      const style = SECTION_STYLES[key] || {
        icon: "📝",
        accent: "border-border",
        label: title,
      };
      sections.push({
        title: style.label,
        icon: style.icon,
        content,
        accent: style.accent,
      });
    } else if (part.trim()) {
      // Intro text before any section header
      sections.push({
        title: "",
        icon: "",
        content: part.trim(),
        accent: "border-border",
      });
    }
  }

  return sections;
}

// ── Component ──

export default function StockNarrative({ narrative, ticker, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(narrative || "");
  const [saving, setSaving] = useState(false);

  const sections = useMemo(
    () => (narrative ? parseSections(narrative) : []),
    [narrative]
  );

  if (!narrative && !editing) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <p className="text-muted text-sm mb-2">No narrative yet</p>
        <p className="text-muted/50 text-xs">
          Run a summary first, then the narrative will be generated automatically.
        </p>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full bg-bg border border-border rounded-lg p-4 text-sm text-fg leading-relaxed min-h-[400px] resize-y font-mono"
          placeholder="Write the story..."
          autoFocus
        />
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={async () => {
              setSaving(true);
              await onSave(draft);
              setSaving(false);
              setEditing(false);
            }}
            disabled={saving}
            className="text-xs bg-accent text-bg px-3 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => {
              setDraft(narrative || "");
              setEditing(false);
            }}
            className="text-xs text-muted hover:text-fg px-3 py-2 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      {/* Edit button — floats above all cards */}
      <button
        onClick={() => {
          setDraft(narrative || "");
          setEditing(true);
        }}
        className="absolute -top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition text-xs text-muted hover:text-fg border border-border rounded-lg px-2 py-1 bg-surface shadow-sm"
      >
        ✏️ Edit story
      </button>

      {/* Section cards */}
      <div className="space-y-3">
        {sections.map((section, i) => (
          <div
            key={i}
            className={`bg-surface border border-border rounded-xl border-l-2 ${section.accent} overflow-hidden`}
          >
            {/* Section header */}
            {section.title && (
              <div className="flex items-center gap-2 px-5 pt-4 pb-1">
                <span className="text-base">{section.icon}</span>
                <h3 className="text-sm font-semibold text-fg">
                  {section.title}
                </h3>
              </div>
            )}

            {/* Section body */}
            <div
              className={`px-5 ${section.title ? "pb-4" : "py-4"} prose prose-invert prose-sm max-w-none
                prose-headings:text-fg prose-headings:font-semibold
                prose-h3:text-xs prose-h3:mt-4 prose-h3:mb-2 prose-h3:text-fg/70
                prose-p:text-fg/80 prose-p:leading-relaxed prose-p:mb-3
                prose-strong:text-fg prose-strong:font-medium
                prose-li:text-fg/70 prose-li:text-xs prose-li:leading-relaxed
                prose-code:text-accent prose-code:text-xs
                prose-a:text-accent prose-a:underline
              `}
            >
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
