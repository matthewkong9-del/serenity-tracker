"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stock {
  id: number;
  ticker: string;
  name: string | null;
  sector: string | null;
  updatedAt: string;
  _count: { files: number; entries: number };
}

export default function Home() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/stocks")
      .then((r) => r.json())
      .then(setStocks);
  }, []);

  const filtered = stocks.filter(
    (s) =>
      s.ticker.toLowerCase().includes(search.toLowerCase()) ||
      (s.name && s.name.toLowerCase().includes(search.toLowerCase())) ||
      (s.sector && s.sector.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-fg">Stocks</h1>
          <p className="text-muted text-sm mt-1">
            {stocks.length} tracked
          </p>
        </div>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface border border-border rounded-lg px-4 py-2 text-sm text-fg w-64 placeholder:text-muted"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted text-lg mb-4">
            {stocks.length === 0 ? "No stocks yet" : "No matches found"}
          </p>
          <Link
            href="/stocks/new"
            className="inline-block bg-accent text-bg px-6 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition"
          >
            Add your first stock
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((stock) => (
            <Link
              key={stock.id}
              href={`/stocks/${stock.ticker}`}
              className="block bg-surface border border-border rounded-xl p-5 hover:border-accent/40 transition group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-fg group-hover:text-accent transition">
                    ${stock.ticker}
                  </h2>
                  {stock.name && (
                    <p className="text-muted text-sm mt-0.5">{stock.name}</p>
                  )}
                </div>
                {stock.sector && (
                  <span className="text-xs bg-bg border border-border rounded-full px-2.5 py-0.5 text-muted">
                    {stock.sector}
                  </span>
                )}
              </div>
              <div className="flex gap-4 mt-4 text-xs text-muted">
                <span>{stock._count.files} files</span>
                <span>{stock._count.entries} notes</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
