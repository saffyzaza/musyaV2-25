import type { Task } from "@/app/agents/types";
import { synthesizer } from "@/app/agents";
import analyzeQuery from "./analyzeQuery";
import researchData from "./researchData";

const writeAnswer: Task = {
  description:
    "เรียบเรียงคำตอบสุดท้ายสำหรับคำถาม: {query}\n\n" +
    "รวบรวมข้อมูลจาก Orchestrator และ Research Agent แล้วเขียนคำตอบที่:\n" +
    "- ชัดเจน อ่านง่าย ใช้ Markdown\n" +
    "- มีตารางถ้ามีข้อมูลตัวเลขหลายรายการ\n" +
    "- มี list ถ้ามีขั้นตอนหรือรายการ\n" +
    "- แนะนำพบแพทย์ถ้าเป็นคำถามเกี่ยวกับอาการหรือการวินิจฉัยโรค",
  expectedOutput:
    "คำตอบฉบับสมบูรณ์ในรูปแบบ Markdown พร้อมหัวข้อ ตาราง และ list ตามความเหมาะสม",
  agent: synthesizer,
  context: [analyzeQuery, researchData],
};

export default writeAnswer;
