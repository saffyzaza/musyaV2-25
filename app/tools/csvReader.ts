import type { ExecutableTool, ToolArgs, ToolResult } from "./types";

const splitLine = (line: string) =>
  line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());

const csvReader: ExecutableTool = {
  name: "csv_reader",
  description:
    "อ่านไฟล์ CSV จาก MinIO โดยใช้ file_id สแกน columns ก่อน แล้ว filter ข้อมูลตาม year และ keyword",
  usage:
    '[TOOL_CALL: csv_reader(file_id="ใส่ ID จาก file_finder", filter_year="2565", filter_keyword="อุบลราชธานี")]',

  async execute(args: ToolArgs, appUrl: string): Promise<ToolResult> {
    const { file_id, filter_year, filter_keyword } = args;

    if (!file_id) return { success: false, data: "ต้องระบุ file_id (ได้จาก file_finder)" };

    // ① Fetch CSV content
    let text = "";
    try {
      const res = await fetch(`${appUrl}/api/files/${file_id}`);
      if (!res.ok) return { success: false, data: `ไม่สามารถอ่านไฟล์ ID: ${file_id}` };
      text = await res.text();
    } catch {
      return { success: false, data: `เกิดข้อผิดพลาดขณะอ่านไฟล์ ${file_id}` };
    }

    const allLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (allLines.length === 0) return { success: false, data: "ไฟล์ว่างเปล่า" };

    // ② Scan columns (header row)
    const headers = splitLine(allLines[0]);
    const dataLines = allLines.slice(1);
    const totalRows = dataLines.length;

    // ③ Filter rows
    let filtered = dataLines;

    if (filter_year) {
      filtered = filtered.filter((row) => row.includes(filter_year));
    }
    if (filter_keyword) {
      const kw = filter_keyword.toLowerCase();
      filtered = filtered.filter((row) => row.toLowerCase().includes(kw));
    }

    // ④ Return up to 50 rows with context
    const preview = filtered.slice(0, 50);

    const lines = [
      `✅ อ่านไฟล์สำเร็จ`,
      `📋 คอลัมน์ (${headers.length} คอลัมน์): ${headers.join(" | ")}`,
      `📊 ทั้งหมด ${totalRows} แถว → กรองแล้ว ${filtered.length} แถว (แสดง ${preview.length}):`,
      "",
      headers.join(","),
      ...preview,
    ];

    if (filtered.length === 0) {
      return {
        success: false,
        data:
          `อ่านไฟล์สำเร็จ แต่ไม่พบข้อมูลที่ตรงกับ filter_year="${filter_year}" filter_keyword="${filter_keyword}"\n` +
          `คอลัมน์ที่มี: ${headers.join(" | ")}\n` +
          `ตัวอย่าง 3 แถวแรก:\n${dataLines.slice(0, 3).join("\n")}`,
      };
    }

    return { success: true, data: lines.join("\n") };
  },
};

export default csvReader;
