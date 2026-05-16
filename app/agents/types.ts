export type AgentVisual = {
  color: string;   // Tailwind text color
  bg: string;      // Tailwind background
  border: string;  // Tailwind border
  dot: string;     // Tailwind dot/badge color
  letter: string;  // Single letter shown in avatar
};

export type AgentDefinition = {
  name: string;
  role: string;          // short role label shown in UI
  description: string;   // what this agent IS
  responsibility: string; // what this agent DOES in the pipeline
  tools: string[];       // tool names this agent may use
  visual: AgentVisual;
};
