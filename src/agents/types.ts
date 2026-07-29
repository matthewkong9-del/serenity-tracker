/**
 * Agent interface — shared contract for all 11 pipeline agents.
 *
 * Every agent module self-registers via registerAgent() on import.
 * Callers dispatch through getAgent(key).run(input).
 */

export interface AgentInput {
  ticker?: string;
}

export interface AgentResult {
  ok: boolean;
  message: string;
  [key: string]: unknown;
}

export interface Agent {
  /** Unique key — matches the trigger route's `agent` param and scheduler dispatch. */
  key: string;
  /** Display name shown on the agent dashboard. */
  name: string;
  /** Emoji shown on the agent dashboard card. */
  emoji: string;
  /** One-line description for the dashboard tooltip. */
  description: string;
  /** PipelineRun stage names this agent owns — used by the status endpoint. */
  stages: string[];
  /** Execute the agent. Called by trigger route, scheduler, and "Run Now" button. */
  run(input?: AgentInput): Promise<AgentResult>;
}
