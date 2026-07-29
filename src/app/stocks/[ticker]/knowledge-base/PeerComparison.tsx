"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Peer {
  ticker: string;
  name: string | null;
  relationship: string;
  confidence: string;
  description: string | null;
  currentPrice: number | null;
  pbRatio: number | null;
  marketCap: number | null;
  chokepointDepth: number | null;
}

interface Props {
  ticker: string;
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  competitor: "Competitor",
  partner: "Partner",
  supplier: "Supplier",
  customer: "Customer",
};

function fmtMCap(val: number | null): string {
  if (!val) return "—";
  if (val >= 1_000_000_000_000) return `$${(val / 1_000_000_000_000).toFixed(1)}T`;
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

export default function PeerComparison({ ticker }: Props) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/stocks/${ticker}/peers`)
      .then((r) => r.json())
      .then((data) => {
        setPeers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-bg rounded w-32" />
          <div className="h-20 bg-bg rounded" />
        </div>
      </div>
    );
  }

  if (peers.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-fg mb-4">🔗 Peer Comparison</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted/50 text-[10px] uppercase tracking-wider">
              <th className="text-left font-medium pb-2 pr-3">Company</th>
              <th className="text-left font-medium pb-2 pr-3">Relation</th>
              <th className="text-right font-medium pb-2 pr-3">Price</th>
              <th className="text-right font-medium pb-2 pr-3">P/B</th>
              <th className="text-right font-medium pb-2 pr-3">Mkt Cap</th>
              <th className="text-right font-medium pb-2">Depth</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((peer) => (
              <tr
                key={peer.ticker}
                className="border-t border-border/50 hover:bg-bg/50 transition"
              >
                <td className="py-2 pr-3">
                  <Link
                    href={`/stocks/${peer.ticker}`}
                    className="text-accent hover:underline font-medium"
                  >
                    ${peer.ticker}
                  </Link>
                  {peer.name && (
                    <span className="text-muted/40 ml-1.5">{peer.name}</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      peer.confidence === "confirmed"
                        ? "bg-green-400/10 text-green-400/80"
                        : peer.confidence === "speculative"
                        ? "bg-amber-400/10 text-amber-400/80"
                        : "bg-muted/10 text-muted/60"
                    }`}
                  >
                    {RELATIONSHIP_LABELS[peer.relationship] || peer.relationship}
                  </span>
                  {peer.description && (
                    <span className="text-muted/30 ml-1.5 truncate max-w-[160px] inline-block align-middle">
                      — {peer.description.slice(0, 60)}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-fg/70">
                  {peer.currentPrice ? `$${peer.currentPrice.toFixed(2)}` : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-fg/70">
                  {peer.pbRatio ? peer.pbRatio.toFixed(2) : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-fg/70">
                  {fmtMCap(peer.marketCap)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {peer.chokepointDepth ? (
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        peer.chokepointDepth >= 4
                          ? "bg-amber-400/10 text-amber-400"
                          : "bg-muted/10 text-muted/60"
                      }`}
                    >
                      {peer.chokepointDepth}/5
                    </span>
                  ) : (
                    <span className="text-muted/30">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
