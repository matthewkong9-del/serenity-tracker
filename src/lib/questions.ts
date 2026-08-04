/**
 * Research question management — template seeding, AI generation,
 * answer staleness detection, and reflection contradiction checking.
 *
 * Modeled on src/lib/relationships.ts and src/lib/portfolio-ai.ts:
 * context builder → chatJson → DB writes → logPipelineRun.
 */

import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/deepseek";
import { logPipelineRun, completePipelineRun } from "@/lib/pipeline-log";
import { TEMPLATE_QUESTIONS } from "@/lib/question-templates";

// ── Lazy template seeding ───────────────────────────────────────────────

/**
 * Ensure template questions exist for a stock. Idempotent — skips
 * if all templates are already present. Called from the questions
 * GET handler and from generateQuestions.
 */
export async function ensureTemplateQuestions(
  stockId: number
): Promise<number> {
  const existing = await prisma.researchQuestion.findMany({
    where: { stockId, source: "template" },
    select: { question: true },
  });

  const existingTexts = new Set(existing.map((q) => q.question));
  const missing = TEMPLATE_QUESTIONS.filter(
    (t) => !existingTexts.has(t.text)
  );

  if (missing.length === 0) return 0;

  await prisma.researchQuestion.createMany({
    data: missing.map((t) => ({
      stockId,
      question: t.text,
      category: t.category,
      source: "template",
      priority: t.defaultPriority,
      status: "open",
    })),
  });

  return missing.length;
}

// ── Text normalization for dedup ─────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// ── AI question generation ───────────────────────────────────────────────

const QUESTION_GEN_SYSTEM = `You are a skeptical research analyst. Your job: identify what questions still need answering about a stock.

You will receive:
- An AI-generated summary of the stock
- Existing claims (with verification status)
- Uploaded documents (with indexed/not-indexed markers)
- Existing research questions and their answers
- The relationship map

Your task:
1. Generate NEW questions that would fill gaps in the analysis — things the summary hints at but doesn't fully answer, areas with thin evidence, contradictions between claims and documents.
2. Identify STALE answers — existing answers that may be contradicted by newer information in the summary or documents.

Rules:
- Do NOT duplicate existing questions (even rephrased)
- Questions must be specific to this company — not generic
- Each question should be answerable through research (documents, filings, news)
- For stale answers, cite the specific contradiction
- If nothing is stale, return an empty staleAnswers array
- If no new questions are needed, return an empty newQuestions array

Return ONLY valid JSON, no markdown.`;

interface GenResult {
  newQuestions: { text: string; category: string; priority: number; reason: string }[];
  staleAnswers: { questionId: number; reason: string }[];
}

export async function generateQuestions(
  ticker: string,
  apiKey: string
): Promise<{ newCount: number; staleCount: number }> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    include: {
      files: { select: { originalName: true, fileType: true, markdown: true } },
      claims: {
        select: { text: true, status: true, evidence: true },
        orderBy: { createdAt: "desc" },
      },
      questions: {
        select: { id: true, question: true, answer: true, source: true, status: true },
      },
      relationships: {
        select: { type: true, target: true, description: true, sourceConfidence: true },
      },
    },
  });

  if (!stock) throw new Error("Stock not found");

  // Ensure templates exist before AI generation
  await ensureTemplateQuestions(stock.id);

  // Reload questions after seeding
  const allQuestions = await prisma.researchQuestion.findMany({
    where: { stockId: stock.id },
    select: { id: true, question: true, answer: true, source: true, status: true },
  });

  // Build context
  const parts: string[] = [];

  // Summary
  if (stock.summary) {
    parts.push(
      "--- SUMMARY ---\n" + stock.summary.slice(0, 8000)
    );
  }

  // Claims
  if (stock.claims.length > 0) {
    parts.push("--- CLAIMS ---");
    for (const c of stock.claims.slice(0, 30)) {
      const statusLabel =
        { unverified: "⚠️", supported: "✅", refuted: "❌", disputed: "🔶" }[
          c.status
        ] || c.status;
      parts.push(`${statusLabel} ${c.text}`);
      if (c.evidence) parts.push(`  Evidence: ${c.evidence.slice(0, 300)}`);
    }
  }

  // Documents
  const indexedFiles = stock.files.filter((f) => f.markdown);
  if (stock.files.length > 0) {
    parts.push("--- DOCUMENTS ---");
    for (const f of stock.files) {
      const status = f.markdown ? "✓ indexed" : "✗ not indexed";
      parts.push(`${status} | ${f.originalName} (${f.fileType})`);
    }
  }

  // Relationships
  if (stock.relationships.length > 0) {
    parts.push("--- RELATIONSHIPS ---");
    for (const r of stock.relationships) {
      const conf =
        r.sourceConfidence === "confirmed"
          ? "✓"
          : r.sourceConfidence === "gap"
            ? "?"
            : "~";
      parts.push(`${conf} ${r.type}: ${r.target} — ${r.description || ""}`);
    }
  }

  // Existing questions with answers
  if (allQuestions.length > 0) {
    parts.push("--- EXISTING QUESTIONS ---");
    for (const q of allQuestions) {
      const answered = q.answer ? ` [ANSWERED: ${q.answer.slice(0, 200)}]` : " [OPEN]";
      parts.push(`#${q.id} (${q.source}) ${q.question}${answered}`);
    }
  }

  const context = parts.join("\n\n");

  if (!context.trim()) {
    return { newCount: 0, staleCount: 0 };
  }

  // Log & call LLM
  const runId = await logPipelineRun({
    stage: "study",
    status: "started",
    stockTicker: ticker,
    stockId: stock.id,
    input: {
      claimCount: stock.claims.length,
      fileCount: stock.files.length,
      questionCount: allQuestions.length,
    },
  });

  try {
    const result = await chatJson<GenResult>(
      [
        { role: "system", content: QUESTION_GEN_SYSTEM },
        { role: "user", content: context },
      ],
      apiKey,
      { temperature: 0.3, purpose: "questions", timeoutMs: 180_000 }
    );

    // Process new questions
    const existingTexts = new Set(
      allQuestions.map((q) => normalize(q.question))
    );
    let newCount = 0;

    for (const nq of result.newQuestions || []) {
      if (!nq.text?.trim()) continue;
      if (existingTexts.has(normalize(nq.text))) continue;

      await prisma.researchQuestion.create({
        data: {
          stockId: stock.id,
          question: nq.text.trim(),
          category: nq.category || "general",
          source: "ai",
          priority: Math.min(10, Math.max(0, nq.priority || 5)),
          status: "open",
        },
      });
      existingTexts.add(normalize(nq.text));
      newCount++;
    }

    // Process stale answers
    let staleCount = 0;
    for (const sa of result.staleAnswers || []) {
      if (!sa.questionId || !sa.reason) continue;

      const question = await prisma.researchQuestion.findUnique({
        where: { id: sa.questionId },
        select: { id: true, stockId: true, answer: true },
      });

      // Only flag if it belongs to this stock and has an answer
      if (!question || question.stockId !== stock.id || !question.answer) continue;

      await prisma.researchQuestion.update({
        where: { id: sa.questionId },
        data: {
          staleReason: sa.reason.slice(0, 500),
          staleAt: new Date(),
        },
      });
      staleCount++;
    }

    if (runId) {
      await completePipelineRun(runId, {
        status: "completed",
        output: { newCount, staleCount },
        decision: `${newCount} new questions, ${staleCount} stale answers flagged.`,
      });
    }

    return { newCount, staleCount };
  } catch (e: any) {
    if (runId) {
      await completePipelineRun(runId, {
        status: "failed",
        error: e.message?.slice(0, 500) || "Unknown error",
        decision: "Question generation failed.",
      });
    }
    throw e;
  }
}

// ── Reflection contradiction checking ────────────────────────────────────

const REFLECTION_CHECK_SYSTEM = `You are a study companion tracking a user's understanding of stocks.

You will receive:
- Recent reflections (things the user wrote that they learned)
- The current AI summary of the stock
- Recent claims and their verification status

Your task: identify any reflections that may be CONTRADICTED by newer information, or that seem OUTDATED based on the current summary.

Return ONLY valid JSON — an array of flags, or an empty array if nothing is flagged:
[{ "annotationId": 3, "flag": "Your note says X but the Q2 filing shows Y..." }]

Be precise — only flag clear contradictions. Do NOT flag reflections that are subjective opinions.`;

interface ReflectionFlag {
  annotationId: number;
  flag: string;
}

export async function checkReflections(
  ticker: string,
  apiKey: string
): Promise<number> {
  const stock = await prisma.stock.findUnique({
    where: { ticker },
    select: { id: true, summary: true },
  });
  if (!stock) throw new Error("Stock not found");

  // Get unchecked freestyle reflections (section = null, not yet checked)
  const reflections = await prisma.annotation.findMany({
    where: {
      stockId: stock.id,
      section: null,
      OR: [
        { aiCheckedAt: null },
        { updatedAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      ],
    },
    select: { id: true, text: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (reflections.length === 0) return 0;

  // Get claims for context
  const claims = await prisma.claim.findMany({
    where: { stockId: stock.id },
    select: { text: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const parts: string[] = [];
  if (stock.summary) {
    parts.push("--- CURRENT SUMMARY ---\n" + stock.summary.slice(0, 5000));
  }
  if (claims.length > 0) {
    parts.push(
      "--- CLAIMS ---\n" +
        claims.map((c) => `[${c.status}] ${c.text}`).join("\n")
    );
  }
  parts.push(
    "--- REFLECTIONS TO CHECK ---\n" +
      reflections
        .map((r) => `#${r.id} [${r.createdAt.toISOString()}] ${r.text}`)
        .join("\n\n")
  );

  const context = parts.join("\n\n");

  try {
    const flags = await chatJson<ReflectionFlag[]>(
      [
        { role: "system", content: REFLECTION_CHECK_SYSTEM },
        { role: "user", content: context },
      ],
      apiKey,
      { temperature: 0.2, purpose: "study", timeoutMs: 120_000 }
    );

    let flagged = 0;
    for (const f of flags || []) {
      if (!f.annotationId || !f.flag) continue;
      await prisma.annotation.updateMany({
        where: { id: f.annotationId, stockId: stock.id },
        data: {
          aiFlag: f.flag.slice(0, 500),
          aiCheckedAt: new Date(),
        },
      });
      flagged++;
    }

    // Mark unchecked reflections as checked even if no flags
    const flaggedIds = new Set((flags || []).map((f) => f.annotationId));
    for (const r of reflections) {
      if (!flaggedIds.has(r.id)) {
        await prisma.annotation.updateMany({
          where: { id: r.id, stockId: stock.id },
          data: { aiCheckedAt: new Date() },
        });
      }
    }

    return flagged;
  } catch (e: any) {
    console.error(
      `[questions] reflection check failed for ${ticker}:`,
      e.message
    );
    return 0;
  }
}
