import type { Task } from "@/app/agents/types";
import { synthesizer } from "@/app/agents";
import analyzeQuery from "./analyzeQuery";
import researchData from "./researchData";

const writeAnswer: Task = {
  description:
    "เรียบเรียงคำตอบสุดท้ายสำหรับคำถาม: {query}\n\n" +
    "ใช้ข้อมูลจาก Research Agent เท่านั้น กฎเคร่งครัด:\n" +
    "❌ ห้ามปัดเศษ เปลี่ยน หรือคำนวณตัวเลขใหม่จากที่ Tool result ให้มา\n" +
    "❌ ห้าม interpolate หรือเดาตัวเลขของปีที่ไม่มีข้อมูล\n" +
    "✅ คัดลอกตัวเลขจาก SOURCE FILE ตรงๆ ไม่ปัดเศษ\n" +
    "✅ ถ้าปีใดไม่มีข้อมูล → ใส่ 'ไม่พบข้อมูล' ในตาราง\n" +
    "✅ ระบุแหล่งที่มา: คัดลอก MARKDOWN_LINK จาก Tool result ตรงๆ (บรรทัดที่ขึ้นต้นด้วย 🔗) ห้ามแต่งเอง\n\n" +
    "จัดรูปแบบ Markdown: ตารางถ้ามีหลายปี/หลายค่า, list ถ้ามีขั้นตอน\n" +
    "แนะนำพบแพทย์ถ้าเป็นคำถามเกี่ยวกับอาการหรือการวินิจฉัยโรค",
  expectedOutput:
    "คำตอบ Markdown ที่:\n" +
    "1. ตัวเลขตรงกับ Tool result ทุกตัว (ห้ามปัดเศษ)\n" +
    "2. ปีที่ไม่มีข้อมูลระบุชัดว่า 'ไม่พบข้อมูล'\n" +
    "3. มีหมายเหตุแหล่งที่มา (ชื่อไฟล์)",
  agent: synthesizer,
  context: [analyzeQuery, researchData],
};

export default writeAnswer;
