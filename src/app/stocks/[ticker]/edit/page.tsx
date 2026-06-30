"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditStock() {
  const params = useParams();
  const router = useRouter();
  const ticker = params.ticker as string;

  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/stocks/${ticker}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((s) => {
        setName(s.name || "");
        setSector(s.sector || "");
        setNotes(s.generalNotes || "");
        setLoading(false);
      })
      .catch(() => router.push("/"));
  }, [ticker, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch(`/api/stocks/${ticker}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sector, notes }),
    });

    setSaving(false);

    if (res.ok) {
      router.push(`/stocks/${ticker}`);
    } else {
      setError("Failed to save");
    }
  }

  if (loading) return <div className="text-muted text-center py-20">Loading...</div>;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-fg mb-1">Edit ${ticker}</h1>
      <p className="text-muted text-sm mb-6">Update stock details and notes</p>

      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="block text-sm text-muted mb-1.5">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-fg"
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1.5">Sector</label>
          <input
            type="text"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-fg"
          />
        </div>

        <div>
          <label className="block text-sm text-muted mb-1.5">General Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-fg resize-none"
            placeholder="Overall thesis, key observations..."
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-bg px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border border-border text-muted px-6 py-2.5 rounded-lg text-sm hover:text-fg transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
