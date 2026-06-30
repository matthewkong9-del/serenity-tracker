"use client";

interface Claim {
  id: number;
  status: string;
}

const CLAIM_COLORS: Record<string, string> = {
  unverified: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  supported: "text-green-400 border-green-400/30 bg-green-400/10",
  refuted: "text-red-400 border-red-400/30 bg-red-400/10",
  disputed: "text-blue-400 border-blue-400/30 bg-blue-400/10",
};

const CLAIM_LABELS: Record<string, string> = {
  unverified: "⏳ Unverified",
  supported: "✅ Verified",
  refuted: "❌ Refuted",
  disputed: "⚔️ Disputed",
};

interface ClaimHealthProps {
  claims: Claim[];
  currentFilter: string | null;
  onFilterClick: (status: string) => void;
}

export function ClaimHealth({ claims, currentFilter, onFilterClick }: ClaimHealthProps) {
  const statuses = ["unverified", "supported", "refuted", "disputed"] as const;

  const counts: Record<string, number> = {};
  for (const s of statuses) {
    counts[s] = claims.filter((c) => c.status === s).length;
  }

  const total = claims.length;

  return (
    <div className="bg-surface border border-border rounded-xl p-5 h-full flex flex-col">
      <h2 className="text-xs text-muted uppercase tracking-wider font-semibold mb-4">
        📊 Claims ({total})
      </h2>

      {total === 0 ? (
        <p className="text-muted text-xs">No claims yet.</p>
      ) : (
        <div className="space-y-2">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => onFilterClick(s)}
              className={`w-full text-left text-xs border rounded-lg px-3 py-2.5 transition hover:opacity-80 flex items-center justify-between ${
                CLAIM_COLORS[s]
              } ${
                currentFilter === s ? "ring-2 ring-offset-2 ring-offset-surface ring-accent/50" : ""
              }`}
            >
              <span>{CLAIM_LABELS[s]}</span>
              <span className="font-bold text-lg leading-none">{counts[s]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
