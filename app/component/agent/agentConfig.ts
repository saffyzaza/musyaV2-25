export type AgentCfg = {
  color: string;
  bg: string;
  border: string;
  dot: string;
  letter: string;
};

export const PIPELINE_AGENTS = [
  { name: "Orchestrator", role: "วิเคราะห์และประสานงาน" },
  { name: "Research Agent", role: "ค้นหาและวิเคราะห์ข้อมูล" },
  { name: "Synthesizer", role: "สรุปและจัดรูปแบบคำตอบ" },
] as const;

export const AGENT_CONFIG: Record<string, AgentCfg> = {
  Orchestrator:     { color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200",  dot: "bg-violet-500",  letter: "O" },
  "Research Agent": { color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200",    dot: "bg-blue-500",    letter: "R" },
  Synthesizer:      { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", letter: "S" },
};

export const DEFAULT_CFG: AgentCfg = {
  color: "text-gray-700",
  bg: "bg-gray-50",
  border: "border-gray-200",
  dot: "bg-gray-400",
  letter: "?",
};

