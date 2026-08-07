"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/db";

// ── Types ──

interface AgentCard {
  key: string;
  name: string;
  emoji: string;
  description: string;
  status: "running" | "idle" | "error" | "paused";
  lastRun: {
    stage: string;
    status: string;
    stockTicker: string | null;
    decision: string | null;
    error: string | null;
    cost: number | null;
    startedAt: string;
    completedAt: string | null;
  } | null;
  counts24h: { completed: number; failed: number };
  countsAll: { completed: number; failed: number };
  metric: { label: string; value: string } | null;
}

interface WatchdogAlert {
  id: number;
  stage: string;
  stockTicker: string | null;
  error: string | null;
  startedAt: string;
}

interface ActivityItem {
  id: number;
  stage: string;
  status: string;
  stockTicker: string | null;
  decision: string | null;
  error: string | null;
  cost: number | null;
  startedAt: string;
  completedAt: string | null;
}

interface StatusData {
  health: "healthy" | "warning" | "critical";
  agents: AgentCard[];
  orchestrator: { paused: boolean };
  watchdogAlerts: WatchdogAlert[];
  recentActivity: ActivityItem[];
  summary: {
    totalErrors24h: number;
    cost24h: number;
    pendingClaims: number;
    lastOrchTick: string | null;
    lastOrchDecision: string | null;
  };
}

// ── Helpers ──

const STATUS_COLORS: Record<string, string> = {
  running: "text-green-400 border-green-400/30 bg-green-400/10",
  idle: "text-muted border-border bg-surface/50",
  error: "text-red-400 border-red-400/30 bg-red-400/10",
  paused: "text-amber-400 border-amber-400/30 bg-amber-400/10",
};

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  idle: "Idle",
  error: "Error",
  paused: "Paused",
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: "text-green-400 border-green-400/30 bg-green-400/10",
  warning: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  critical: "text-red-400 border-red-400/30 bg-red-400/10",
};

const STAGE_EMOJI: Record<string, string> = {
  sync: "📥",
  sync_ingest: "📥",
  sync_extract: "📥",
  research: "🔬",
  verify: "🔬",
  "research-all": "🔬",
  summarize: "📊",
  narrative: "📊",
  relationship: "📊",
  price_refresh: "💹",
  scoring: "🏷️",
  cleanup: "🧹",
  dedup: "🧹",
  watchdog: "🐕",
  auditor: "🔍",
  orchestrate: "🎯",
};

function stageEmoji(stage: string): string {
  return STAGE_EMOJI[stage] || "⚙️";
}

// ── Page ──

export default function AgentActivityPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [orchestratorPaused, setOrchestratorPaused] = useState(false);
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [expandedActivity, setExpandedActivity] = useState<Set<number>>(new Set());

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/status");
      const d: StatusData = await res.json();
      setData(d);
      setOrchestratorPaused(d.orchestrator?.paused === true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Poll every 30s for live updates
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const triggerAgent = async (key: string) => {
    setTriggering(key);
    try {
      const res = await fetch("/api/agents/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: key }),
      });
      const result = await res.json();
      // Brief toast-like feedback
      if (result.ok) {
        // Refresh after short delay to let the agent start
        setTimeout(fetchStatus, 1000);
      }
    } catch {
      // silent
    } finally {
      setTriggering(null);
    }
  };

  const toggleOrchestrator = async () => {
    setTriggering("orchestrator");
    try {
      const action = orchestratorPaused ? "resume" : "pause";
      await fetch("/api/agents/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setOrchestratorPaused(!orchestratorPaused);
      setTimeout(fetchStatus, 1500);
    } catch {
      // silent
    } finally {
      setTriggering(null);
    }
  };

  const toggleExpand = (id: number) => {
    const next = new Set(expandedActivity);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedActivity(next);
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface rounded w-64" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <div key={i} className="h-40 bg-surface border border-border rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-20">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-fg mb-1">Agent Activity</h1>
          <p className="text-sm text-muted">
            {data.agents.length} agents running ·{" "}
            {data.summary.lastOrchTick ? (
              <>last orchestration {timeAgo(data.summary.lastOrchTick)}</>
            ) : (
              "orchestrator idle"
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Health badge */}
          <span
            className={`text-xs border rounded-full px-3 py-1.5 font-medium ${
              HEALTH_COLORS[data.health]
            }`}
          >
            {data.health === "healthy" ? "🟢 All Systems Go" : data.health === "warning" ? "🟡 Issues Detected" : "🔴 Critical"}
          </span>
          <button
            onClick={fetchStatus}
            className="text-xs text-muted hover:text-fg border border-border rounded-lg px-3 py-1.5 transition"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatTile
          label="Errors (24h)"
          value={String(data.summary.totalErrors24h)}
          color={data.summary.totalErrors24h > 0 ? "text-red-400" : "text-green-400"}
        />
        <StatTile
          label="Cost Today"
          value={`$${data.summary.cost24h.toFixed(4)}`}
          color="text-fg"
        />
        <StatTile
          label="Pending Claims"
          value={String(data.summary.pendingClaims)}
          color={data.summary.pendingClaims > 20 ? "text-amber-400" : "text-fg"}
        />
        <StatTile
          label="Orch Tick"
          value={data.summary.lastOrchDecision || "—"}
          color="text-muted"
        />
        <StatTile
          label="Orchestrator (click to toggle)"
          value={orchestratorPaused ? "⏸️ Paused" : "▶️ Running"}
          color={orchestratorPaused ? "text-amber-400" : "text-green-400"}
          onClick={toggleOrchestrator}
        />
      </div>

      {/* ── Watchdog Alerts ── */}
      {data.watchdogAlerts.length > 0 && (
        <div className="mb-6 border border-red-400/30 bg-red-400/5 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-red-400 mb-2">
            🐕 Watchdog Alerts ({data.watchdogAlerts.length})
          </h2>
          <div className="space-y-2">
            {data.watchdogAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-3 text-xs text-red-300/80"
              >
                <span className="mt-0.5">⚠️</span>
                <div>
                  <span className="font-medium">{stageEmoji(alert.stage)} {alert.stage}</span>
                  {alert.stockTicker && (
                    <Link
                      href={`/stocks/${alert.stockTicker}`}
                      className="text-red-400 hover:underline ml-1"
                    >
                      ${alert.stockTicker}
                    </Link>
                  )}
                  <span className="text-red-400/60 ml-2">{timeAgo(alert.startedAt)}</span>
                  {alert.error && (
                    <div className="text-red-400/50 mt-0.5 truncate max-w-lg">{alert.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Agent Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {data.agents.map((agent) => (
          <div
            key={agent.key}
            className={`bg-surface border rounded-xl p-5 transition ${
              agent.status === "error"
                ? "border-red-400/30"
                : agent.status === "running"
                ? "border-green-400/30"
                : "border-border"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{agent.emoji}</span>
                <span className="text-sm font-semibold text-fg">{agent.name}</span>
              </div>
              <span
                className={`text-[10px] border rounded-full px-2 py-0.5 ${
                  STATUS_COLORS[agent.status]
                }`}
              >
                {STATUS_LABELS[agent.status]}
              </span>
            </div>

            {/* Description */}
            <p className="text-[11px] text-muted/60 mb-3 leading-relaxed">
              {agent.description}
            </p>

            {/* Metric */}
            {agent.metric && (
              <div className="mb-3">
                <span className="text-xs text-muted">{agent.metric.label}: </span>
                <span className="text-xs font-semibold text-fg">{agent.metric.value}</span>
              </div>
            )}

            {/* Counts */}
            <div className="flex items-center gap-3 mb-3 text-[10px]">
              <span className="text-green-400/80">
                ✓ {agent.counts24h.completed}
              </span>
              <span className={agent.counts24h.failed > 0 ? "text-red-400" : "text-muted/40"}>
                ✗ {agent.counts24h.failed}
              </span>
              <span className="text-muted/40">
                {agent.countsAll.completed} all-time
              </span>
            </div>

            {/* Last run */}
            {agent.lastRun ? (
              <div className="text-[10px] text-muted/50 mb-3 truncate">
                {agent.lastRun.stockTicker ? (
                  <Link
                    href={`/stocks/${agent.lastRun.stockTicker}`}
                    className="text-accent hover:underline"
                  >
                    ${agent.lastRun.stockTicker}
                  </Link>
                ) : (
                  stageEmoji(agent.lastRun.stage)
                )}{" "}
                {agent.lastRun.decision
                  ? agent.lastRun.decision.slice(0, 80)
                  : agent.lastRun.status}{" "}
                · {timeAgo(agent.lastRun.startedAt)}
              </div>
            ) : (
              <div className="text-[10px] text-muted/30 mb-3">No runs yet</div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => triggerAgent(agent.key)}
                disabled={triggering === agent.key}
                className="text-[10px] font-medium text-accent hover:text-fg border border-accent/30 hover:border-accent rounded-lg px-3 py-1 transition disabled:opacity-50"
              >
                {triggering === agent.key ? "⋯" : "▶ Run Now"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Activity Feed ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-fg">Recent Activity</h2>
          <div className="flex items-center gap-2">
            {["all", "summarize", "research", "relationship", "error"].map((f) => (
              <button
                key={f}
                onClick={() => setActivityFilter(f)}
                className={`text-[10px] border rounded-full px-2 py-0.5 transition ${
                  activityFilter === f
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border text-muted hover:text-fg"
                }`}
              >
                {f === "all" ? "All" : f === "error" ? "Errors" : stageEmoji(f)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          {data.recentActivity
            .filter((item) => {
              if (activityFilter === "all") return true;
              if (activityFilter === "error") return item.status === "failed";
              return item.stage.includes(activityFilter);
            })
            .map((item) => (
              <div
                key={item.id}
                className={`rounded-lg p-3 transition cursor-pointer ${
                  item.status === "failed"
                    ? "bg-red-400/5 border border-red-400/20"
                    : "bg-surface/30 hover:bg-surface/60 border border-transparent"
                }`}
                onClick={() => toggleExpand(item.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm">{stageEmoji(item.stage)}</span>
                  <span className="text-[11px] text-muted font-medium w-20 truncate">
                    {item.stage}
                  </span>
                  {item.stockTicker && (
                    <Link
                      href={`/stocks/${item.stockTicker}`}
                      className="text-xs text-accent hover:underline font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ${item.stockTicker}
                    </Link>
                  )}
                  <span
                    className={`text-[10px] rounded-full px-2 py-0.5 ${
                      item.status === "completed"
                        ? "text-green-400/80 bg-green-400/5"
                        : item.status === "failed"
                        ? "text-red-400 bg-red-400/10"
                        : "text-amber-400/80 bg-amber-400/5"
                    }`}
                  >
                    {item.status}
                  </span>
                  <span className="text-[10px] text-muted/40 ml-auto">
                    {timeAgo(item.startedAt)}
                  </span>
                  {item.cost != null && (
                    <span className="text-[10px] text-muted/30">
                      ${item.cost.toFixed(4)}
                    </span>
                  )}
                  <span className="text-[10px] text-muted/30">
                    {expandedActivity.has(item.id) ? "▲" : "▼"}
                  </span>
                </div>

                {/* Expanded detail */}
                {expandedActivity.has(item.id) && (
                  <div className="mt-3 pl-8 text-xs text-muted/70 space-y-1">
                    {item.decision && (
                      <div>
                        <span className="text-muted/40">Decision: </span>
                        {item.decision}
                      </div>
                    )}
                    {item.error && (
                      <div className="text-red-400/80">
                        <span className="text-red-400/40">Error: </span>
                        {item.error}
                      </div>
                    )}
                    {item.completedAt && (
                      <div>
                        <span className="text-muted/40">Duration: </span>
                        {Math.round(
                          (new Date(item.completedAt).getTime() -
                            new Date(item.startedAt).getTime()) /
                            1000
                        )}
                        s
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>

        {data.recentActivity.length === 0 && (
          <div className="text-center py-12 text-muted text-sm">
            No activity yet. Agents will log here as they run.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat Tile ──

function StatTile({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: string;
  color: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className={`text-base font-bold ${color} truncate`}>{value}</div>
      <div className="text-[10px] text-muted/50 mt-0.5">{label}</div>
    </>
  );
  return onClick ? (
    <button
      onClick={onClick}
      className="bg-surface border border-border rounded-xl p-4 text-left hover:border-accent/40 transition cursor-pointer"
    >
      {inner}
    </button>
  ) : (
    <div className="bg-surface border border-border rounded-xl p-4">{inner}</div>
  );
}
