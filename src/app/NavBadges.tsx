"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function NavBadges() {
  const [badges, setBadges] = useState<{
    unverifiedClaims: number;
    stocksWithErrors: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/nav-badges")
      .then((r) => r.json())
      .then(setBadges)
      .catch(() => {});
  }, []);

  if (!badges) return null;

  return (
    <div className="flex items-center gap-3">
      {badges.unverifiedClaims > 0 && (
        <Link
          href="/research"
          className="text-xs bg-amber-400/10 text-amber-400 border border-amber-400/20 rounded-full px-2 py-0.5 hover:bg-amber-400/20 transition-colors"
        >
          {badges.unverifiedClaims} to research
        </Link>
      )}
      {badges.stocksWithErrors > 0 && (
        <Link
          href="/claims?status=unverified"
          className="text-xs bg-red-400/10 text-red-400 border border-red-400/20 rounded-full px-2 py-0.5 hover:bg-red-400/20 transition-colors"
        >
          {badges.stocksWithErrors} errors
        </Link>
      )}
    </div>
  );
}
