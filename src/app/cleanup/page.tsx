"use client";

import { useEffect, useState } from "react";

interface CleanupTask {
  id: number;
  type: string;
  status: string;
  summary: string;
  detail: string;
  createdAt: string;
}

interface DuplicateGroup {
  keptClaimId: number;
  duplicateIds: number[];
  mergedText: string;
  reason: string;
}

export default function CleanupPage() {
  const [tasks, setTasks] = useState<CleanupTask[]>([]);
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function refresh() {
    fetch("/api/cleanup")
      .then((r) => r.json())
      .then(setTasks);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleScan() {
    setScanning(true);
    setResult(null);
    const res = await fetch("/api/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scan" }),
    });
    const data = await res.json();
    setScanning(false);
    if (res.ok) {
      setResult(`Scanned ${data.scanned} stocks, found ${data.duplicateGroups} duplicate groups.`);
    } else {
      setResult(`Error: ${data.error}`);
    }
    refresh();
    setTimeout(() => setResult(null), 6000);
  }

  async function handleStatus(id: number, status: string) {
    await fetch(`/api/cleanup?id=${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    refresh();
  }

  async function handleExecute() {
    setExecuting(true);
    const res = await fetch("/api/cleanup", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "execute" }),
    });
    const data = await res.json();
    setExecuting(false);
    setResult(`Merged ${data.merged} duplicate claims across ${data.tasks} tasks.`);
    refresh();
    setTimeout(() => setResult(null), 6000);
  }

  const pending = tasks.filter((t) => t.status === "pending");
  const approved = tasks.filter((t) => t.status === "approved");
  const done = tasks.filter((t) => t.status === "executed" || t.status === "ignored");

  function parseDetail(task: CleanupTask): DuplicateGroup | null {
    try {
      return JSON.parse(task.detail);
    } catch {
      return null;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-fg">Cleanup</h1>
          <p className="text-muted text-sm mt-1">
            Monthly data quality audit — find and merge duplicate claims
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="text-xs border border-border text-muted px-3 py-2 rounded-lg hover:text-accent hover:border-accent/30 transition disabled:opacity-50"
          >
            {scanning ? "Scanning..." : "Re-scan"}
          </button>
          {approved.length > 0 && (
            <button
              onClick={handleExecute}
              disabled={executing}
              className="bg-accent text-bg px-4 py-2 rounded-lg text-xs font-medium hover:bg-accent/90 transition disabled:opacity-50"
            >
              {executing ? "Executing..." : `Execute Approved (${approved.length})`}
            </button>
          )}
        </div>
      </div>

      {result && (
        <div className="bg-accent/10 border border-accent/20 rounded-lg px-4 py-3 mb-6 text-sm text-fg">
          {result}
        </div>
      )}

      {tasks.length === 0 && !scanning ? (
        <p className="text-muted text-center py-20">
          No cleanup tasks yet. Run a scan to find duplicate claims.
        </p>
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-fg/60 uppercase tracking-wider mb-3">
                Needs Review ({pending.length})
              </h2>
              <div className="space-y-2">
                {pending.map((task) => {
                  const detail = parseDetail(task);
                  return (
                    <div key={task.id} className="bg-surface border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-fg font-medium">{task.summary}</p>
                          {detail && (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-muted">{detail.reason}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-[10px] bg-accent/10 text-accent border border-accent/20 rounded px-1.5 py-0.5">
                                  Keep: #{detail.keptClaimId} — &ldquo;{detail.mergedText.slice(0, 80)}...&rdquo;
                                </span>
                                {detail.duplicateIds.map((dupId) => (
                                  <span
                                    key={dupId}
                                    className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 rounded px-1.5 py-0.5"
                                  >
                                    Remove: #{dupId}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <p className="text-[10px] text-muted mt-2">
                            {new Date(task.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleStatus(task.id, "approved")}
                            className="text-[10px] bg-accent text-bg px-2.5 py-1 rounded-md font-medium hover:bg-accent/90 transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleStatus(task.id, "ignored")}
                            className="text-[10px] border border-border text-muted px-2.5 py-1 rounded-md hover:text-red-400 hover:border-red-400/30 transition"
                          >
                            Ignore
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Done */}
          {done.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-fg/60 uppercase tracking-wider mb-3">
                Done ({done.length})
              </h2>
              <div className="space-y-1">
                {done.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 text-xs py-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        task.status === "executed" ? "bg-accent" : "bg-muted"
                      }`}
                    />
                    <span className="text-fg/70 truncate">{task.summary}</span>
                    <span className="text-muted ml-auto shrink-0">
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
