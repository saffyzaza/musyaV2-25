import type { ExecutableTool, ToolArgs, ToolResult } from "./types";

type FileMeta = { id: string; name: string; path: string };

const splitLine = (line: string) =>
  line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());

// Parse year range: "2565-2569" → [2565,2566,2567,2568,2569]
// Or comma list: "2565,2567" → [2565,2567]
function parseYearFilter(filter_years: string): ((row: string) => boolean) | null {
  if (!filter_years) return null;

  const rangeMatch = filter_years.match(/^(\d{4})-(\d{4})$/);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[1]);
    const to   = parseInt(rangeMatch[2]);
    const years = Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
    return (row) => years.some((y) => row.includes(y));
  }

  const list = filter_years.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length > 0) return (row) => list.some((y) => row.includes(y));

  return (row) => row.includes(filter_years);
}

const multiCsvReader: ExecutableTool = {
  name: "multi_csv_reader",
  description:
    "อ่านหลายไฟล์ CSV พร้อมกัน (สำหรับข้อมูลหลายปีที่เก็บแยกไฟล์) รองรับ filter_years แบบ range",
  usage:
    '[TOOL_CALL: multi_csv_reader(file_ids="id1,id2,id3,id4,id5", filter_years="2565-2569", filter_keyword="อุบลราชธานี")]',

  async execute(args: ToolArgs, appUrl: string): Promise<ToolResult> {
    const { file_ids, filter_years, filter_keyword } = args;

    if (!file_ids) return { success: false, data: "ต้องระบุ file_ids (comma-separated จาก file_finder)" };

    const ids = file_ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return { success: false, data: "ไม่พบ file_ids ที่ถูกต้อง" };

    const yearFilter = parseYearFilter(filter_years ?? "");
    const kwLower = filter_keyword?.toLowerCase() ?? "";

    const sections: string[] = [];
    let totalFilesRead = 0;
    let totalRowsFound = 0;

    for (const file_id of ids.slice(0, 10)) {
      // Fetch metadata
      let meta: FileMeta | null = null;
      try {
        const r = await fetch(`${appUrl}/api/files/${file_id}?meta=1`);
        if (r.ok) meta = (await r.json()) as FileMeta;
      } catch { /* skip */ }

      // Fetch content
      let text = "";
      try {
        const r = await fetch(`${appUrl}/api/files/${file_id}`);
        if (!r.ok) { sections.push(`❌ ID ${file_id}: ไม่สามารถอ่านได้`); continue; }
        text = await r.text();
      } catch { sections.push(`❌ ID ${file_id}: เกิดข้อผิดพลาด`); continue; }

      const allLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (allLines.length === 0) { sections.push(`⚠️ ID ${file_id}: ไฟล์ว่าง`); continue; }

      const headers = splitLine(allLines[0]);
      const dataLines = allLines.slice(1);

      // Filter
      let filtered = dataLines;
      if (yearFilter) filtered = filtered.filter(yearFilter);
      if (kwLower)    filtered = filtered.filter((r) => r.toLowerCase().includes(kwLower));

      totalFilesRead++;
      totalRowsFound += filtered.length;

      const sourceName = meta ? `${meta.name}` : `ID:${file_id}`;
      const sourcePath = meta ? ` | path: ${meta.path}` : "";

      if (filtered.length === 0) {
        sections.push(
          `📄 ${sourceName}${sourcePath}\n` +
          `   ⚠️ ไม่พบแถวที่ตรงกับ filter_years="${filter_years}" filter_keyword="${filter_keyword}"\n` +
          `   (ไฟล์มี ${dataLines.length} แถว, 3 ตัวอย่าง: ${dataLines.slice(0, 3).join(" | ")})`,
        );
      } else {
        sections.push(
          `📄 SOURCE: "${sourceName}"${sourcePath}\n` +
          `   คอลัมน์: ${headers.join(" | ")}\n` +
          `   พบ ${filtered.length} แถว:\n` +
          `   ${headers.join(",")}\n` +
          filtered.slice(0, 30).map((r) => `   ${r}`).join("\n"),
        );
      }
    }

    const summary = [
      `📊 สรุป: อ่าน ${totalFilesRead}/${ids.length} ไฟล์ พบข้อมูล ${totalRowsFound} แถวรวม`,
      `⚠️ ใช้ตัวเลขจาก SOURCE FILE ข้างต้นเท่านั้น ห้ามแต่งข้อมูล`,
      "",
      ...sections,
    ];

    return { success: totalRowsFound > 0, data: summary.join("\n") };
  },
};

export default multiCsvReader;
