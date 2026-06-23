"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewStock() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/stocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, name, sector, notes }),
    });

    setLoading(false);

    if (res.ok) {
      const stock = await res.json();
      router.push(`/stocks/${stock.ticker}`);
    } else {
      const data = await res.json();
      setError(data.error || "Something went wrong");
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-fg mb-6">Add Stock</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm text-muted mb-1.5">Ticker *</label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="NVDA"
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="NVIDIA Corporation"
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50"
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1.5">Sector</label>
          <input
            type="text"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="Technology"
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50"
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1.5">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Initial thoughts..."
            rows={4}
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-fg placeholder:text-muted/50 resize-none"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-accent text-bg px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Stock"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border border-border text-muted px-6 py-2.5 rounded-lg text-sm hover:text-fg hover:border-fg/30 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
