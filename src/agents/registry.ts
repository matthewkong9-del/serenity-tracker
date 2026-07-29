import { Agent } from "./types";

const agents = new Map<string, Agent>();

/** Register an agent. Called by each agent module at import time. */
export function registerAgent(agent: Agent): void {
  agents.set(agent.key, agent);
}

/** Look up an agent by key (e.g. "watchdog", "research"). */
export function getAgent(key: string): Agent | undefined {
  return agents.get(key);
}

/** Get all registered agents (for the dashboard status endpoint). */
export function getAllAgents(): Agent[] {
  return Array.from(agents.values());
}
