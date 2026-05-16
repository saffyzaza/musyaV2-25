import type { Task } from "@/app/agents/types";
import { researchAgent } from "@/app/agents";
import analyzeQuery from "./analyzeQuery";

const researchData: Task = {
  description:
    "ค้นหาและวิเคราะห์ข้อมูลสำหรับคำถาม: {query}\n\n" +
    "ใช้เครื่องมือที่ Orchestrator แนะนำ ดึงข้อมูลที่ถูกต้องและครอบคลุม " +
    "ถ้าข้อมูลเป็นตัวเลขให้จัดเป็นตาราง CSV สั้นๆ ถ้าเป็นขั้นตอนให้จัดเป็น list " +
    "ระบุ tool ที่ใช้จริงในรูปแบบ [TOOL: ชื่อ tool] ที่ต้นผลลัพธ์",
  expectedOutput:
    "ผลการวิเคราะห์ที่มีโครงสร้าง: tool ที่ใช้ + ข้อมูลที่พบ + ข้อสรุปเชิงข้อมูล (ไม่ใช่คำตอบสุดท้าย)",
  agent: researchAgent,
  context: [analyzeQuery],
};

export default researchData;
