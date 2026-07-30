/**
 * In-process event system for agent feedback loops.
 *
 * Enables agents to react to each other's work without tight coupling.
 * Key flow: researchClaim completes → emit claim:researched →
 * debounced re-summarization of the affected stock.
 *
 * Uses a simple EventEmitter pattern — no external dependencies.
 * Singleton instance exported as `events`.
 */

import { summarizeStock } from "@/lib/summarize";
import { runExtractions } from "@/lib/relationships";
import { generateNarrative } from "@/lib/narrative";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ClaimResearchedPayload {
  ticker: string;
  claimId: number;
  newStatus: string;
}

export interface StockSummarizedPayload {
  ticker: string;
}

/** Map of event name → payload type. Add new events here. */
export interface EventMap {
  "claim:researched": ClaimResearchedPayload;
  "stock:summarized": StockSummarizedPayload;
}

type EventName = keyof EventMap;
type Handler<T> = (payload: T) => void;

// ── EventEmitter ────────────────────────────────────────────────────────────

class EventEmitter {
  private handlers = new Map<string, Set<Handler<any>>>();

  /** Register a listener for an event. Returns an unsubscribe function. */
  on<E extends EventName>(event: E, handler: Handler<EventMap[E]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  /** Emit an event to all registered listeners. */
  emit<E extends EventName>(event: E, payload: EventMap[E]): void {
    const handlers = this.handlers.get(event as string);
    if (!handlers) return;
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (e: any) {
        console.error(`[events] handler for "${event}" threw: ${e.message}`);
      }
    });
  }
}

/** Singleton event bus for the entire app. */
export const events = new EventEmitter();

// ── Built-in feedback listeners ─────────────────────────────────────────────
//
// These register on import so the feedback loops are always active.
// Each listener is fire-and-forget — errors are logged, never thrown.

/** Minimum seconds between summarization triggers per ticker. */
const SUMMARIZE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

/** Track pending summarization timeouts per ticker for debouncing. */
const pendingSummaries = new Map<string, ReturnType<typeof setTimeout>>();

events.on("claim:researched", (payload: ClaimResearchedPayload) => {
  const { ticker, claimId, newStatus } = payload;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return;

  // Clear any existing timeout for this ticker (debounce)
  const existing = pendingSummaries.get(ticker);
  if (existing) clearTimeout(existing);

  // Schedule re-summarization after cooldown
  const timeout = setTimeout(async () => {
    pendingSummaries.delete(ticker);
    try {
      console.log(
        `[events] claim #${claimId} (${ticker}) researched → ${newStatus}, triggering re-summary`
      );
      await summarizeStock(ticker, apiKey);
      // Chain: summarization → re-extract relationships + regenerate narrative
      void runExtractions(ticker, apiKey).catch((e: any) =>
        console.error(`[events] relationships for ${ticker} failed: ${e.message}`)
      );
      void generateNarrative(ticker, apiKey).catch((e: any) =>
        console.error(`[events] narrative for ${ticker} failed: ${e.message}`)
      );
    } catch (e: any) {
      console.error(`[events] re-summarize ${ticker} failed: ${e.message}`);
    }
  }, SUMMARIZE_COOLDOWN_MS);

  pendingSummaries.set(ticker, timeout);
});

console.log("[events] feedback listeners registered (claim:researched → summarize + extract + narrate)");
