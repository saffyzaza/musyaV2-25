import type { Task } from "@/app/agents/types";
import { orchestrator } from "@/app/agents";

const analyzeQuery: Task = {
  description:
    "วิเคราะห์คำถามของผู้ใช้: {query}\n\n" +
    "ระบุ:\n" +
    "1. หัวข้อหลักที่ถามถึง\n" +
    "2. ประเภทข้อมูลที่ต้องการ (ตัวเลข/วิชาการ/ปฏิบัติ)\n" +
    "3. เครื่องมือที่ Research Agent ควรใช้จาก: knowledge_search, data_analysis, clinical_guidelines, statistics_tool, nutrition_database, disease_surveillance\n" +
    "4. คำค้นหาหรือ filter ที่ควรใช้",
  expectedOutput:
    "การวิเคราะห์สั้นๆ 3-5 ประโยค ระบุหัวข้อ ประเภทข้อมูล tool ที่แนะนำ และ keyword สำหรับ Research Agent",
  agent: orchestrator,
};

export default analyzeQuery;
