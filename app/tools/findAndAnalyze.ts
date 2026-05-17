import type { ExecutableTool, ToolArgs, ToolResult } from "./types";

type StoredFile = { id: string; name: string; path: string };

// ─── Combined: AI picks the right file AND reads/analyzes it in one step ──────

const findAndAnalyze: ExecutableTool = {
  name: "find_and_analyze",
  description:
    "ค้นหาไฟล์ CSV ที่เหมาะสมใน MinIO แล้ว AI อ่านทั้งไฟล์และวิเคราะห์ตามคำถาม ในขั้นตอนเดียว",
  usage:
    '[TOOL_CALL: find_and_analyze(query="พยายามฆ่าตัวตาย จ.ยโสธร ปี 2024 จำนวนชาย หญิง รวม")]',

  async execute(args: ToolArgs, appUrl: string, callAI): Promise<ToolResult> {
    const { query } = args;
    if (!query) return { success: false, data: "ต้องระบุ query" };
    if (!callAI) return { success: false, data: "ไม่มี AI helper" };

    // ① List all CSV files
    let files: StoredFile[] = [];
    try {
      const res = await fetch(`${appUrl}/api/files`);
      if (!res.ok) return { success: false, data: "ไม่สามารถเข้าถึง API ไฟล์" };
      const all = (await res.json()) as (StoredFile & { previewKind: string; extension: string })[];
      files = all.filter((f) => f.previewKind === "csv" || f.extension?.toLowerCase() === "csv");
    } catch {
      return { success: false, data: "เกิดข้อผิดพลาดในการดึงรายการไฟล์" };
    }

    if (files.length === 0) return { success: false, data: "ไม่พบไฟล์ CSV ในระบบ" };

    const fileList = files.map((f) => `ID:${f.id} | ${f.path}/${f.name}`).join("\n");

    // ② AI selects the best file(s) for this query
    const selectionRaw = await callAI(
      "คุณเป็น AI เลือกไฟล์ CSV ที่เหมาะสมที่สุด ตอบ JSON เท่านั้น",
      `Query: "${query}"\n\nไฟล์ทั้งหมด:\n${fileList}\n\nเลือกไฟล์ที่น่าจะมีข้อมูลตรงกับ query ที่สุด\nJSON: {"file_id": "ID เดียวที่ดีที่สุด", "reason": "เหตุผลสั้นๆ"}`,
    );

    let chosenId = "";
    let chosenReason = "";
    try {
      const m = selectionRaw.match(/```json\s*([\s\S]*?)\s*```/) || selectionRaw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? (m[1] ?? m[0]) : selectionRaw) as { file_id?: string; reason?: string };
      chosenId = parsed.file_id?.trim() ?? "";
      chosenReason = parsed.reason ?? "";
    } catch {
      // Try to extract ID from raw text
      const m = selectionRaw.match(/ID:(\S+)/);
      chosenId = m ? m[1].replace(/[",]/g, "") : "";
    }

    if (!chosenId) {
      return {
        success: false,
        data: `AI ไม่สามารถเลือกไฟล์ได้\nAI response: ${selectionRaw}\n\nไฟล์ทั้งหมด:\n${fileList}`,
      };
    }

    const chosenFile = files.find((f) => f.id === chosenId);
    const fileName = chosenFile ? `${chosenFile.path}/${chosenFile.name}` : chosenId;

    // ③ Fetch the full CSV content
    let csvText = "";
    try {
      const r = await fetch(`${appUrl}/api/files/${chosenId}`);
      if (!r.ok) return { success: false, data: `ไม่สามารถอ่านไฟล์ ID: ${chosenId}` };
      csvText = await r.text();
    } catch {
      return { success: false, data: `เกิดข้อผิดพลาดขณะอ่านไฟล์ ${chosenId}` };
    }

    const totalRows = csvText.split(/\r?\n/).filter((l) => l.trim()).length - 1;
    const fileUrl = `/api/files/${chosenId}`;
    const displayName = chosenFile?.name ?? chosenId;

    // ④ AI analyzes the ENTIRE file
    const analysis = await callAI(
      [
        "คุณเป็น AI วิเคราะห์ข้อมูล CSV",
        "ตอบด้วยตัวเลขจริงจากไฟล์เท่านั้น ห้ามประดิษฐ์",
        "ถ้ามีหลายแถวต่อจังหวัด/ต่ออำเภอ ให้ SUM รวมก่อนตอบ",
        "ถ้าไม่พบข้อมูลที่ถามให้บอกตรงๆ",
      ].join("\n"),
      `ไฟล์: ${displayName} (${totalRows} แถว)\n\nข้อมูลทั้งหมด:\n${csvText}\n\nคำถาม: ${query}\n\nตอบเป็น Markdown ระบุตัวเลขรวมรายจังหวัด รายปี`,
    );

    return {
      success: true,
      data: [
        `📄 ชื่อไฟล์: ${displayName} (${totalRows} แถว ส่งทั้งไฟล์)`,
        `🔗 MARKDOWN_LINK: [${displayName}](${fileUrl})`,
        `📌 เหตุผลที่เลือก: ${chosenReason}`,
        "",
        "📊 ผลการวิเคราะห์:",
        analysis,
      ].join("\n"),
    };
  },
};

export default findAndAnalyze;
