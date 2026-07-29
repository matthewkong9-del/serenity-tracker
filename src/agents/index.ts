/**
 * Barrel file — importing this registers all 11 agents via their
 * module-level registerAgent() calls. Consumers can then dispatch
 * through getAgent(key).run(input).
 */

import "./watchdog";
import "./ops";
import "./auditor";
import "./editor";
import "./ingest";
import "./price";
import "./cleanup";
import "./research";
import "./analysis";
import "./scoring";
import "./orchestrator";

export { registerAgent, getAgent, getAllAgents } from "./registry";
export type { Agent, AgentInput, AgentResult } from "./types";
