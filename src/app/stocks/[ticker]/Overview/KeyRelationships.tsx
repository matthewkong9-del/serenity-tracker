"use client";

interface Relationship {
  id: number;
  type: string;
  target: string;
  description: string | null;
  confidence: string;
  section: string;
}

interface KeyRelationshipsProps {
  relationships: Relationship[];
  onViewAll: () => void;
}

const confidenceDot = (c: string) =>
  c === "confirmed"
    ? "border-emerald-400 bg-emerald-400/20"
    : c === "speculative"
      ? "border-amber-400 bg-amber-400/20"
      : "border-slate-500 bg-slate-500/20";

const confidenceBadge = (c: string) =>
  c === "confirmed"
    ? "text-emerald-400 border-emerald-400/20 bg-emerald-400/10"
    : c === "speculative"
      ? "text-amber-400 border-amber-400/20 bg-amber-400/10"
      : "text-slate-400 border-slate-400/20 bg-slate-400/10";

const confidenceLabel = (c: string) => (c === "confirmed" ? "✓" : c === "speculative" ? "?" : "⟳");

export function KeyRelationships({ relationships, onViewAll }: KeyRelationshipsProps) {
  const mapRels = relationships.filter((r) => r.section !== "contrarian");

  // Count by type
  const typeCounts = new Map<string, number>();
  for (const r of mapRels) {
    typeCounts.set(r.type, (typeCounts.get(r.type) || 0) + 1);
  }

  // Sort by confidence: confirmed first, then speculative, then gap
  const sorted = [...mapRels].sort((a, b) => {
    const order = { confirmed: 0, speculative: 1, gap: 2 };
    return (
      (order[a.confidence as keyof typeof order] ?? 3) -
      (order[b.confidence as keyof typeof order] ?? 3)
    );
  });

  return (
    <div className="bg-surface border border-border rounded-xl p-5 h-full flex flex-col">
      <h2 className="text-xs text-muted uppercase tracking-wider font-semibold mb-4">
        🔗 Key Relationships
      </h2>

      {mapRels.length === 0 ? (
        <>
          <p className="text-muted text-xs mb-4">No relationships mapped yet.</p>
          <button
            onClick={onViewAll}
            className="text-accent text-xs hover:underline mt-auto self-start"
          >
            Map Relationships →
          </button>
        </>
      ) : (
        <>
          {/* Type summary */}
          <div className="flex flex-wrap gap-2 mb-4">
            {Array.from(typeCounts.entries()).map(([type, count]) => (
              <span
                key={type}
                className="text-xs bg-bg border border-border rounded-full px-2.5 py-0.5 text-muted"
              >
                {type} ({count})
              </span>
            ))}
          </div>

          {/* Top 5 relationships */}
          <div className="space-y-2 flex-1">
            {sorted.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-start gap-2">
                <span
                  className={`w-2 h-2 rounded-full border mt-1.5 shrink-0 ${confidenceDot(r.confidence)}`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-fg text-sm font-medium truncate">{r.target}</span>
                    <span
                      className={`text-[10px] border rounded-full px-1.5 py-0.5 ${confidenceBadge(r.confidence)}`}
                    >
                      {confidenceLabel(r.confidence)}
                    </span>
                  </div>
                  {r.description && (
                    <p className="text-muted/60 text-xs line-clamp-1 mt-0.5">{r.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onViewAll}
            className="text-accent text-xs hover:underline mt-4 self-start"
          >
            View full map →
          </button>
        </>
      )}
    </div>
  );
}
