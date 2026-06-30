"use client";

interface Relationship {
  id: number;
  type: string;
  target: string;
  description: string | null;
  confidence: string;
  section: string;
}

interface ContrarianAnglesProps {
  relationships: Relationship[];
}

export function ContrarianAngles({ relationships }: ContrarianAnglesProps) {
  const contrarian = relationships.filter((r) => r.section === "contrarian");

  if (contrarian.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 h-full flex flex-col">
      <h2 className="text-xs text-muted uppercase tracking-wider font-semibold mb-4 flex items-center gap-2">
        <span className="text-purple-400">💡</span>
        Outside the Box
      </h2>

      <div className="space-y-3 flex-1">
        {contrarian.slice(0, 3).map((a) => (
          <div
            key={a.id}
            className="border border-purple-400/20 bg-purple-400/5 rounded-lg p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase text-purple-400/70 border border-purple-400/20 rounded-full px-2 py-0.5">
                {a.type}
              </span>
              <span className="text-fg text-sm font-medium">{a.target}</span>
            </div>
            {a.description && (
              <p className="text-fg/70 text-xs leading-relaxed line-clamp-2">
                {a.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
