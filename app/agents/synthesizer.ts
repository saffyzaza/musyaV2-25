import type { AgentDefinition } from "./types";

const synthesizer: AgentDefinition = {
  name: "Synthesizer",
  role: "สรุปและจัดรูปแบบคำตอบ",
  description:
    "Agent สุดท้ายที่รวบรวมข้อมูลจากทุก agent แล้วเรียบเรียงเป็นคำตอบที่ชัดเจน อ่านง่าย และครบถ้วน",
  responsibility:
    "① รับข้อมูลจาก Research Agent → ② รวบรวมและเรียบเรียง → ③ จัดรูปแบบเป็น Markdown พร้อม ตาราง/list → ④ ส่งคำตอบสุดท้ายให้ผู้ใช้",
  tools: [],
  visual: {
    color:  "text-emerald-700",
    bg:     "bg-emerald-50",
    border: "border-emerald-200",
    dot:    "bg-emerald-500",
    letter: "S",
  },
};

export default synthesizer;
