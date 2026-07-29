"use client";

interface ClaimCounts {
  supported: number;
  refuted: number;
  disputed: number;
  unverified: number;
  total: number;
}

interface Props {
  chokepointDepth: number | null;
  pbRatio: number | null;
  marketCap: number | null;
  currentPrice: number | null;
  currency: string | null;
  claimCounts: ClaimCounts;
  summary: string | null;
}

/**
 * Evidence cards — the structured data grid below the narrative.
 * Each card answers one investment question at a glance.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", KRW: "₩", JPY: "¥", TWD: "NT$", CNY: "¥", HKD: "HK$",
  EUR: "€", GBP: "£", CAD: "C$", AUD: "A$",
};

export default function EvidenceCards({
  chokepointDepth,
  pbRatio,
  marketCap,
  currentPrice,
  currency,
  claimCounts,
}: Props) {
  const csym = CURRENCY_SYMBOLS[currency || "USD"] || "$";
  const clabel = currency && currency !== "USD" ? ` ${currency}` : "";
  const resolved = claimCounts.supported + claimCounts.refuted;
  const verifiedRate = claimCounts.total > 0
    ? Math.round((resolved / claimCounts.total) * 100)
    : 0;

  const formatMcap = (m: number | null) => {
    if (!m) return "—";
    // Finnhub returns market cap in millions
    if (m >= 1_000_000) return `$${(m / 1_000_000).toFixed(1)}T`;
    if (m >= 1_000) return `$${(m / 1_000).toFixed(1)}B`;
    if (m >= 1) return `$${m.toFixed(0)}M`;
    return `$${(m * 1000).toFixed(0)}K`;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Chokepoint */}
      <Card
        label="Chokepoint"
        value={chokepointDepth ? `${chokepointDepth}/5` : "—"}
        detail={
          chokepointDepth
            ? chokepointDepth >= 4
              ? "Strong moat"
              : chokepointDepth >= 3
                ? "Solid position"
                : "Weak moat"
            : "Not rated"
        }
        color={
          chokepointDepth && chokepointDepth >= 4
            ? "green"
            : chokepointDepth && chokepointDepth >= 3
              ? "amber"
              : "neutral"
        }
      />

      {/* Evidence */}
      <Card
        label="Evidence"
        value={`${verifiedRate}%`}
        detail={`${resolved} of ${claimCounts.total} claims verified`}
        color={verifiedRate >= 50 ? "green" : verifiedRate >= 25 ? "amber" : "neutral"}
      />

      {/* Valuation */}
      <Card
        label="Valuation"
        value={pbRatio ? `${pbRatio.toFixed(1)}x P/B` : "—"}
        detail={
          currentPrice
            ? `${csym}${currentPrice.toFixed(2)}${clabel} • ${formatMcap(marketCap)}`
            : formatMcap(marketCap)
        }
        color={
          pbRatio && pbRatio < 1.0
            ? "green"
            : pbRatio && pbRatio < 1.5
              ? "amber"
              : "neutral"
        }
      />

      {/* Risk */}
      <Card
        label="Risk"
        value={
          claimCounts.refuted > 0
            ? `${claimCounts.refuted} refuted`
            : claimCounts.disputed > 0
              ? `${claimCounts.disputed} disputed`
              : "Low flags"
        }
        detail={
          claimCounts.unverified > 5
            ? `${claimCounts.unverified} unverified — needs work`
            : claimCounts.unverified > 0
              ? `${claimCounts.unverified} unverified`
              : "All claims resolved"
        }
        color={
          claimCounts.refuted > 0
            ? "red"
            : claimCounts.unverified > 3
              ? "amber"
              : "green"
        }
      />

      {/* Gaps */}
      <Card
        label="Data Gaps"
        value={chokepointDepth ? "Ready" : "Thin"}
        detail={
          claimCounts.total === 0
            ? "No claims yet"
            : chokepointDepth
              ? "Summary complete"
              : "Needs summary"
        }
        color={chokepointDepth ? "green" : "amber"}
      />
    </div>
  );
}

// ── Mini card ──

function Card({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: "green" | "amber" | "red" | "neutral";
}) {
  const colors: Record<string, string> = {
    green: "border-green-400/20 bg-green-400/5 text-green-400",
    amber: "border-amber-400/20 bg-amber-400/5 text-amber-400",
    red: "border-red-400/20 bg-red-400/5 text-red-400",
    neutral: "border-border bg-bg/30 text-muted",
  };

  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted/60 mb-1">
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] text-muted/50 mt-0.5 leading-tight">
        {detail}
      </div>
    </div>
  );
}
