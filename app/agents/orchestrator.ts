import type { AgentDefinition } from "./types";

const orchestrator: AgentDefinition = {
  name: "Orchestrator",
  role: "วิเคราะห์และประสานงาน",
  description:
    "Agent หลักที่รับคำถามจากผู้ใช้ ทำความเข้าใจเจตนา และวางแผนว่า agent ใดควรทำอะไร",
  responsibility:
    "① รับคำถาม → ② วิเคราะห์ว่าต้องการข้อมูลประเภทใด → ③ มอบหมายให้ Research Agent ดำเนินการต่อ",
  tools: [],
  visual: {
    color:  "text-violet-700",
    bg:     "bg-violet-50",
    border: "border-violet-200",
    dot:    "bg-violet-500",
    letter: "O",
  },
};

export default orchestrator;
