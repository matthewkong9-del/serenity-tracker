/**
 * Orchestrator agent — coordinates all other agents.
 *
 * The `run()` method triggers a full orchestrator tick (telegram check,
 * catch-up enqueue, task drain, notifications). The scheduler calls
 * orchestratorTick() directly; this agent exists for the "Run Now"
 * button on the dashboard and manual API triggers.
 */

import { orchestratorTick } from "@/lib/orchestrator";
import { registerAgent } from "./registry";
import type { Agent, AgentInput, AgentResult } from "./types";

async function run(_input?: AgentInput): Promise<AgentResult> {
  const result = await orchestratorTick();
  return {
    ok: true,
    message: result.workDone ? result.summary : "Nothing to do",
    ...result,
  };
}

const agent: Agent = {
  key: "orchestrator",
  name: "Orchestrator",
  emoji: "🎯",
  description: "Coordinates all agents, delegates work via task queue",
  stages: ["orchestrate"],
  run,
};

registerAgent(agent);
