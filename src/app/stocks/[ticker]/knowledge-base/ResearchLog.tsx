"use client";

import { useEffect, useState, useCallback } from "react";
import { effectivePriority, priorityTier } from "@/lib/question-priority";
import { CATEGORY_LABELS, CATEGORY_ICONS } from "@/lib/question-templates";
import { timeAgo } from "@/lib/db";

interface Question {
  id: number;
  question: string;
  answer: string | null;
  source: string;
  category: string | null;
  status: string;
  priority: number;
  priorityLock: boolean;
  staleReason: string | null;
  staleAt: string | null;
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Coverage {
  category: string;
  total: number;
  answered: number;
  open: number;
}

const SOURCE_ICONS: Record<string, string> = {
  template: "📋",
  ai: "🤖",
  user: "✏️",
};

interface Props {
  ticker: string;
}

export default function ResearchLog({ ticker }: Props) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newQ, setNewQ] = useState("");
  const [newCat, setNewCat] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAnswered, setShowAnswered] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [genResult, setGenResult] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stocks/${ticker}/questions`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
        setCoverage(data.coverage || []);
      }
    } catch {/* silent */}
    setLoading(false);
  }, [ticker]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Sort: open first by effective priority desc, then answered, then skipped
  const sorted = [...questions].sort((a, b) => {
    // Open status first
    const statusOrder: Record<string, number> = { open: 0, answered: 1, skipped: 2 };
    const sa = statusOrder[a.status] ?? 3;
    const sb = statusOrder[b.status] ?? 3;
    if (sa !== sb) return sa - sb;

    // Within same status: effective priority desc
    const pa = effectivePriority({
      priority: a.priority,
      priorityLock: a.priorityLock,
      staleReason: a.staleReason,
      status: a.status,
      answer: a.answer,
      answeredAt: a.answeredAt,
      updatedAt: a.updatedAt,
    });
    const pb = effectivePriority({
      priority: b.priority,
      priorityLock: b.priorityLock,
      staleReason: b.staleReason,
      status: b.status,
      answer: b.answer,
      answeredAt: b.answeredAt,
      updatedAt: b.updatedAt,
    });
    return pb - pa;
  });

  // ── Filtering
  const filtered = sorted.filter((q) => {
    if (filterCat && q.category !== filterCat) return false;
    if (q.status === "answered" && !showAnswered) return false;
    if (q.status === "skipped" && !showSkipped) return false;
    return true;
  });

  const openCount = questions.filter((q) => q.status === "open").length;
  const answeredCount = questions.filter((q) => q.status === "answered").length;
  const staleCount = questions.filter((q) => q.staleReason).length;

  // ── Actions
  async function handleAdd() {
    if (!newQ.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/stocks/${ticker}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: newQ.trim(), category: newCat || null }),
      });
      if (res.ok) {
        setNewQ("");
        setNewCat("");
        setAdding(false);
        load();
      }
    } catch {/* silent */} finally {
      setSaving(false);
    }
  }

  async function handleAnswer(q: Question) {
    if (!answerDraft.trim()) return;
    await fetch(`/api/stocks/${ticker}/questions/${q.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: answerDraft.trim(), status: "answered" }),
    });
    setExpandedId(null);
    setAnswerDraft("");
    load();
  }

  async function handleStatusChange(q: Question, status: string) {
    await fetch(`/api/stocks/${ticker}/questions/${q.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function handlePriority(q: Question, delta: number) {
    const newPriority = Math.max(0, q.priority + delta);
    await fetch(`/api/stocks/${ticker}/questions/${q.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: newPriority }),
    });
    load();
  }

  async function handleDelete(q: Question) {
    if (!confirm("Delete this question?")) return;
    await fetch(`/api/stocks/${ticker}/questions/${q.id}`, { method: "DELETE" });
    load();
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenResult("");
    try {
      const res = await fetch(`/api/stocks/${ticker}/questions/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setGenResult(
          `${data.newQuestions || 0} new questions · ${data.staleFlagged || 0} answers flagged stale`
        );
        // Poll for new questions to appear
        setTimeout(() => load(), 3000);
      } else {
        setGenResult(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setGenResult(`Error: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-bg rounded w-48" />
          <div className="h-3 bg-bg rounded w-72" />
          <div className="h-32 bg-bg rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">📋 Research Log</h3>
          <p className="text-[10px] text-muted/50 mt-0.5">
            {openCount} open · {answeredCount} answered
            {staleCount > 0 && (
              <span className="text-amber-400 ml-1">
                · {staleCount} ⚠️ stale
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding(!adding)}
            className="text-xs text-accent hover:text-fg transition"
          >
            {adding ? "Cancel" : "＋ Add"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-xs border border-border text-muted hover:text-fg px-2 py-1.5 rounded-lg transition disabled:opacity-50"
          >
            {generating ? "Generating..." : "✨ Generate"}
          </button>
        </div>
      </div>

      {/* Generate result */}
      {genResult && (
        <div className="mb-3 bg-bg border border-border rounded-lg px-3 py-2 text-xs text-fg/70">
          {genResult}
        </div>
      )}

      {/* ── Add form ── */}
      {adding && (
        <div className="mb-4 p-3 bg-bg border border-accent/30 rounded-lg space-y-2">
          <textarea
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
            placeholder="What do you want to find out about this stock?"
            className="w-full bg-surface border border-border rounded px-3 py-2 text-xs text-fg placeholder-muted/40 resize-y min-h-[50px]"
            rows={2}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <select
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              className="bg-surface border border-border rounded px-2 py-1 text-xs text-fg"
            >
              <option value="">Any category</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {CATEGORY_ICONS[key]} {label}
                </option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={saving || !newQ.trim()}
              className="ml-auto text-xs bg-accent text-bg px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* ── Coverage bar ── */}
      {coverage.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {coverage.map((c) => (
            <button
              key={c.category}
              onClick={() =>
                setFilterCat(filterCat === c.category ? null : c.category)
              }
              className={`text-[10px] border rounded-full px-2 py-0.5 transition ${
                filterCat === c.category
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : c.open > 0
                    ? "border-amber-400/20 bg-amber-400/5 text-amber-400/80"
                    : "border-border text-muted"
              }`}
            >
              {CATEGORY_ICONS[c.category] || "📝"}{" "}
              {CATEGORY_LABELS[c.category] || c.category}{" "}
              <span className="text-muted/50">
                {c.answered}/{c.total}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => setShowAnswered(!showAnswered)}
          className={`text-[10px] transition ${
            showAnswered ? "text-fg" : "text-muted/50 hover:text-muted"
          }`}
        >
          {showAnswered ? "▾" : "▸"} Answered ({answeredCount})
        </button>
        <button
          onClick={() => setShowSkipped(!showSkipped)}
          className={`text-[10px] transition ${
            showSkipped ? "text-fg" : "text-muted/50 hover:text-muted"
          }`}
        >
          Show skipped
        </button>
        {filterCat && (
          <button
            onClick={() => setFilterCat(null)}
            className="text-[10px] text-accent"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* ── Question list ── */}
      {filtered.length === 0 ? (
        <p className="text-xs text-muted/40 text-center py-4">
          No questions yet. Hit ✨ Generate or ＋ Add your own.
        </p>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filtered.map((q) => {
            const ep = effectivePriority({
              priority: q.priority,
              priorityLock: q.priorityLock,
              staleReason: q.staleReason,
              status: q.status,
              answer: q.answer,
              answeredAt: q.answeredAt,
              updatedAt: q.updatedAt,
            });
            const tier = priorityTier(ep);
            const isExpanded = expandedId === q.id;

            return (
              <div
                key={q.id}
                className={`border rounded-lg transition ${
                  q.staleReason
                    ? "border-amber-400/20 bg-amber-400/5"
                    : q.status === "answered"
                      ? "border-border/50 bg-bg/30"
                      : "border-border bg-bg/50 hover:border-muted/50"
                }`}
              >
                {/* Row header */}
                <div className="flex items-start gap-2 px-3 py-2">
                  {/* Priority badge */}
                  <span
                    className={`text-[10px] font-mono shrink-0 mt-0.5 ${tier.color}`}
                    title={`Effective priority: ${ep}`}
                  >
                    {tier.label}
                  </span>

                  {/* Source icon */}
                  <span className="text-xs shrink-0 mt-0.5" title={q.source}>
                    {SOURCE_ICONS[q.source] || "📝"}
                  </span>

                  {/* Category chip */}
                  {q.category && (
                    <span className="text-[10px] border border-border rounded-full px-1.5 py-0.5 text-muted shrink-0">
                      {CATEGORY_ICONS[q.category]}{" "}
                      {CATEGORY_LABELS[q.category] || q.category}
                    </span>
                  )}

                  {/* Question text */}
                  <span
                    className={`text-xs flex-1 cursor-pointer ${
                      q.status === "answered"
                        ? "text-muted/60"
                        : q.status === "skipped"
                          ? "text-muted/40 line-through"
                          : "text-fg/80"
                    }`}
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedId(null);
                      } else {
                        setExpandedId(q.id);
                        setAnswerDraft(q.answer || "");
                      }
                    }}
                  >
                    {q.question}
                    {q.staleReason && (
                      <span className="text-amber-400 ml-1" title={q.staleReason}>
                        ⚠️
                      </span>
                    )}
                  </span>
                </div>

                {/* Row actions */}
                <div className="flex items-center gap-1 px-3 pb-2">
                  {q.status === "open" && (
                    <button
                      onClick={() => {
                        setExpandedId(q.id);
                        setAnswerDraft(q.answer || "");
                      }}
                      className="text-[10px] text-accent hover:text-fg transition"
                    >
                      Answer
                    </button>
                  )}
                  {q.status === "answered" && (
                    <button
                      onClick={() => {
                        setExpandedId(q.id);
                        setAnswerDraft(q.answer || "");
                      }}
                      className="text-[10px] text-muted hover:text-fg transition"
                    >
                      Edit
                    </button>
                  )}
                  {q.status !== "skipped" && (
                    <button
                      onClick={() => handleStatusChange(q, "skipped")}
                      className="text-[10px] text-muted/50 hover:text-fg transition"
                    >
                      Skip
                    </button>
                  )}
                  {q.status === "skipped" && (
                    <button
                      onClick={() => handleStatusChange(q, "open")}
                      className="text-[10px] text-muted/50 hover:text-fg transition"
                    >
                      Reopen
                    </button>
                  )}

                  {/* Priority arrows */}
                  <span className="ml-auto flex items-center gap-0.5">
                    <button
                      onClick={() => handlePriority(q, 1)}
                      className="text-[10px] text-muted/30 hover:text-fg transition"
                      title="Increase priority"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handlePriority(q, -1)}
                      className="text-[10px] text-muted/30 hover:text-fg transition"
                      title="Decrease priority"
                    >
                      ▼
                    </button>
                  </span>

                  <button
                    onClick={() => handleDelete(q)}
                    className="text-[10px] text-red-400/30 hover:text-red-400 transition ml-1"
                  >
                    ✕
                  </button>
                </div>

                {/* Stale banner */}
                {q.staleReason && (
                  <div className="mx-3 mb-2 bg-amber-400/5 border border-amber-400/10 rounded px-2 py-1.5 text-[10px] text-amber-400/80">
                    ⚠️ {q.staleReason}
                    <button
                      onClick={() => {
                        setExpandedId(q.id);
                        setAnswerDraft(q.answer || "");
                      }}
                      className="ml-2 text-accent hover:underline"
                    >
                      Review answer →
                    </button>
                  </div>
                )}

                {/* Answer section (expanded) */}
                {isExpanded && (
                  <div className="border-t border-border px-3 py-3 bg-bg/50">
                    {/* Existing answer display */}
                    {q.answer && !answerDraft && (
                      <div>
                        <p className="text-xs text-fg/70 leading-relaxed whitespace-pre-wrap">
                          {q.answer}
                        </p>
                        {q.answeredAt && (
                          <p className="text-[10px] text-muted/30 mt-1">
                            Answered {timeAgo(q.answeredAt)}
                          </p>
                        )}
                        <button
                          onClick={() => setAnswerDraft(q.answer || "")}
                          className="text-[10px] text-accent hover:underline mt-1"
                        >
                          Edit answer
                        </button>
                      </div>
                    )}

                    {/* Answer editor */}
                    {(!q.answer || answerDraft) && (
                      <div className="space-y-2">
                        <textarea
                          value={answerDraft}
                          onChange={(e) => setAnswerDraft(e.target.value)}
                          placeholder="Write your research findings..."
                          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-fg placeholder-muted/40 resize-y min-h-[80px]"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAnswer(q)}
                            disabled={!answerDraft.trim()}
                            className="text-xs bg-accent text-bg px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
                          >
                            Save Answer
                          </button>
                          <button
                            onClick={() => {
                              setExpandedId(null);
                              setAnswerDraft("");
                            }}
                            className="text-xs text-muted hover:text-fg transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
