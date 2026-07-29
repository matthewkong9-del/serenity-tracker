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
  description: "Coordinates all agents, runs every 30s",
  stages: ["orchestrate"],
  run,
};

registerAgent(agent);
