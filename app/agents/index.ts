import orchestrator from "./orchestrator";
import researchAgent from "./researchAgent";
import synthesizer from "./synthesizer";

export type { Agent, Task, Crew, TaskOutput, CrewOutput, AgentVisual, ToolDefinition } from "./types";

export const AGENTS = { orchestrator, researchAgent, synthesizer };

// Lookup by name
export const AGENT_MAP = Object.fromEntries(
  Object.values(AGENTS).map((a) => [a.name, a]),
);

// Pipeline slot list for UI
export const PIPELINE_AGENTS = Object.values(AGENTS).map((a) => ({
  name: a.name,
  role: a.role,
}));

export { orchestrator, researchAgent, synthesizer };
