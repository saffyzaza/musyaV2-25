export type ToolArgs = Record<string, string>;

export type ToolResult = {
  success: boolean;
  data: string;
};

export type ExecutableTool = {
  name: string;
  description: string;
  // Shown in agent system prompt so the LLM knows how to call it
  usage: string;
  execute: (args: ToolArgs, appUrl: string) => Promise<ToolResult>;
};
