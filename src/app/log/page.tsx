"use client";

import { useEffect, useMemo, useState } from "react";

interface LogEntry {
  id: number;
  type: "api_call" | "cleanup_task";
  timestamp: string;
  // api_call fields
  source?: string;
  purpose?: string;
  model?: string;
  cost?: number;
  inputChars?: number;
  outputChars?: number;
  // cleanup_task fields
  taskType?: string;
  taskStatus?: string;
  summary?: string;
  detail?: string;
}

const PURPOSE_ICON: Record<string, string> = {
  pre_filter: "🔍",
  claim_extraction: "📝",
  summarize: "📊",
  research_verdict: "🔬",
  relationship: "🕸️",
  cleanup_scan: "🧹",
  price_refresh: "💰",
};

const PURPOSE_LABEL: Record<string, string> = {
  pre_filter: "Pre-filter",
  claim_extraction: "Claim extraction",
  summarize: "Summarize",
  research_verdict: "Research verdict",
  relationship: "Relationship map",
  cleanup_scan: "Cleanup scan",
  price_refresh: "Price refresh",
};

const TASK_LABEL: Record<string, string> = {
  duplicate_claim: "Duplicate claim",
  ticker_normalize: "Ticker normalize",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  approved: "text-green-400 border-green-400/30 bg-green-400/10",
  ignored: "text-muted border-border bg-muted/10",
  executed: "text-blue-400 border-blue-400/30 bg-blue-400/10",
};

function dateLabel(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (day.getTime() === today.getTime()) return "Today";
  if (day.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtCost(cost: number | null | undefined): string {
  if (cost == null) return "";
  if (cost === 0) return "free";
  return "$" + cost.toFixed(4);
}

function detailPreview(detail: string | undefined): string | null {
  if (!detail) return null;
  try {
    const obj = JSON.parse(detail);
    const parts: string[] = [];
    if (obj.action) parts.push(obj.action as string);
    if (obj.keep != null && obj.merge != null)
      parts.push(`keep #${obj.keep} → merge #${obj.merge}`);
    if (obj.ticker) parts.push((obj.ticker as string).toUpperCase());
    return parts.join(" · ") || null;
  } catch {
    return detail.length > 80 ? detail.slice(0, 80) + "…" : detail;
  }
}

export default function LogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  function refresh() {
    fetch("/api/log?days=14")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries));
  }

  useEffect(() => {
    refresh();
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, LogEntry[]> = {};
    for (const e of entries) {
      const key = dateLabel(e.timestamp);
      (g[key] ||= []).push(e);
    }
    return g;
  }, [entries]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fg">Activity Log</h1>
          <p className="text-muted text-sm mt-1">
            {entries.length} events from the last 14 days
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted text-center py-20">No activity yet.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([label, items]) => (
            <section key={label}>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 sticky top-14 bg-bg/80 backdrop-blur py-1 z-10">
                {label} ({items.length})
              </h2>
              <div className="space-y-1.5">
                {items.map((entry) => {
                  const time = new Date(entry.timestamp).toLocaleTimeString(
                    [],
                    { hour: "2-digit", minute: "2-digit" }
                  );

                  if (entry.type === "api_call") {
                    const icon = PURPOSE_ICON[entry.purpose || ""] || "⚡";
                    const label =
                      PURPOSE_LABEL[entry.purpose || ""] ||
                      entry.purpose ||
                      "API call";
                    return (
                      <div
                        key={`call-${entry.id}`}
                        className="bg-surface border border-border rounded-lg px-4 py-2.5 flex items-center gap-3"
                      >
                        <span className="text-sm">{icon}</span>
                        <span className="text-xs text-fg/90 flex-1">
                          {label}
                        </span>
                        <span className="text-[10px] text-muted">{time}</span>
                        <span className="text-[10px] text-muted tabular-nums w-12 text-right">
                          {fmtCost(entry.cost)}
                        </span>
                      </div>
                    );
                  }

                  // cleanup_task
                  const detail = detailPreview(entry.detail);
                  return (
                    <div
                      key={`task-${entry.id}`}
                      className="bg-surface border border-border rounded-lg px-4 py-2.5 flex items-center gap-3"
                    >
                      <span className="text-sm">🧹</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-fg/90">
                          {entry.summary ||
                            TASK_LABEL[entry.taskType || ""] ||
                            entry.taskType}
                        </span>
                        {detail && (
                          <span className="text-[10px] text-muted ml-2">
                            {detail}
                          </span>
                        )}
                      </div>
                      {entry.taskStatus && (
                        <span
                          className={`text-[10px] border rounded-full px-2 py-0.5 ${
                            STATUS_COLOR[entry.taskStatus] ||
                            "text-muted border-border bg-muted/10"
                          }`}
                        >
                          {entry.taskStatus}
                        </span>
                      )}
                      <span className="text-[10px] text-muted">{time}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
