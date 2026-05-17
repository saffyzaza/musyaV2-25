import type { Task } from "@/app/agents/types";
import { synthesizer } from "@/app/agents";
import analyzeQuery from "./analyzeQuery";
import researchData from "./researchData";

const writeAnswer: Task = {
  description:
    "เรียบเรียงคำตอบสุดท้ายสำหรับคำถาม: {query}\n\n" +
    "🚨 กฎเหล็ก (ละเมิด = ตอบผิด):\n" +
    "❌ ห้ามใช้ตัวเลขที่ไม่ปรากฏใน Research Agent context\n" +
    "❌ ห้ามปรับ format (2 → 2%, 1234 → '1.2K')\n" +
    "❌ ห้าม interpolate ปีที่ไม่มี (ถ้ามีแค่ 2568, 2569 อย่าเดา 2565-2567)\n" +
    "✅ คัดลอกตัวเลขจาก Research Agent ตรงๆ\n" +
    "✅ ปีที่ไม่มีข้อมูล → 'ไม่พบในไฟล์' (ห้ามเดา)\n" +
    "✅ ระบุแหล่งที่มา: คัดลอก MARKDOWN_LINK จาก Tool result\n\n" +
    "ก่อนเขียนคำตอบ: ตรวจสอบทุกตัวเลขว่าตรงกับ Research Agent\n" +
    "ถ้าไม่ตรง = ถือว่าแต่ง → แก้ให้ตรง",
  expectedOutput:
    "คำตอบ Markdown ที่:\n" +
    "1. ทุกตัวเลขตรงกับ Research Agent (verbatim, ไม่ปัด, ไม่ปรับ format)\n" +
    "2. ปีที่ Research Agent ไม่มี → ระบุชัด 'ไม่พบในไฟล์'\n" +
    "3. มี MARKDOWN_LINK ของไฟล์ที่ใช้",
  agent: synthesizer,
  context: [analyzeQuery, researchData],
};

export default writeAnswer;
