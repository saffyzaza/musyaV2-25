import orchestrator from "./orchestrator";
import researchAgent from "./researchAgent";
import synthesizer from "./synthesizer";
import type { AgentDefinition, AgentVisual } from "./types";

export type { AgentDefinition, AgentVisual };

// Pipeline execution order
export const AGENTS: AgentDefinition[] = [orchestrator, researchAgent, synthesizer];

// Lookup by name
export const AGENT_MAP: Record<string, AgentDefinition> = Object.fromEntries(
  AGENTS.map((a) => [a.name, a]),
);

// Flat list for pipeline slots (name + role only)
export const PIPELINE_AGENTS = AGENTS.map((a) => ({ name: a.name, role: a.role }));

export { orchestrator, researchAgent, synthesizer };
