import type { AgentDefinition } from "./types";

const researchAgent: AgentDefinition = {
  name: "Research Agent",
  role: "ค้นหาและวิเคราะห์ข้อมูล",
  description:
    "Agent ผู้เชี่ยวชาญด้านการค้นหาและวิเคราะห์ข้อมูล รับงานจาก Orchestrator แล้วใช้ tool ที่เหมาะสมเพื่อดึงและประมวลผลข้อมูล",
  responsibility:
    "① รับหัวข้อจาก Orchestrator → ② เลือก tool ที่เหมาะสม → ③ ดึงและวิเคราะห์ข้อมูล → ④ ส่งผลให้ Synthesizer",
  tools: [
    "knowledge_search",
    "data_analysis",
    "clinical_guidelines",
    "statistics_tool",
    "nutrition_database",
    "disease_surveillance",
  ],
  visual: {
    color:  "text-blue-700",
    bg:     "bg-blue-50",
    border: "border-blue-200",
    dot:    "bg-blue-500",
    letter: "R",
  },
};

export default researchAgent;
