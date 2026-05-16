import type { ExecutableTool, ToolArgs, ToolResult } from "./types";

type FileMeta = { id: string; name: string; path: string };

const splitLine = (line: string) =>
  line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());

function buildYearFilter(filter_years: string): ((row: string) => boolean) | null {
  if (!filter_years) return null;
  const rangeMatch = filter_years.match(/^(\d{4})-(\d{4})$/);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[1]);
    const to   = parseInt(rangeMatch[2]);
    const years = Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
    return (row) => years.some((y) => row.includes(y));
  }
  const list = filter_years.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? (row) => list.some((y) => row.includes(y)) : null;
}

// Smart filter with fallback:
// 1. Try year+keyword → 2. Try year only → 3. Try keyword only → 4. All rows
function smartFilter(
  rows: string[],
  yearFilter: ((r: string) => boolean) | null,
  kwLower: string,
): { filtered: string[]; note: string } {
  // Try year + keyword
  if (yearFilter && kwLower) {
    const r = rows.filter((row) => yearFilter(row) && row.toLowerCase().includes(kwLower));
    if (r.length > 0) return { filtered: r, note: "filter: year + keyword" };
  }
  // Try year only
  if (yearFilter) {
    const r = rows.filter(yearFilter);
    if (r.length > 0) return { filtered: r, note: "filter: year เท่านั้น (ไม่พบ keyword ในแถว — ไฟล์อาจเป็นข้อมูลเฉพาะจังหวัดแล้ว)" };
  }
  // Try keyword only
  if (kwLower) {
    const r = rows.filter((row) => row.toLowerCase().includes(kwLower));
    if (r.length > 0) return { filtered: r, note: "filter: keyword เท่านั้น" };
  }
  // Fallback: all rows (file is already province/domain specific)
  return {
    filtered: rows,
    note: "แสดงทุกแถว (ไม่พบ filter ในเนื้อหาแถว — ไฟล์นี้เป็นข้อมูลเฉพาะของจังหวัด/ปีนั้นอยู่แล้ว)",
  };
}

const multiCsvReader: ExecutableTool = {
  name: "multi_csv_reader",
  description:
    "อ่านหลายไฟล์ CSV พร้อมกัน (สำหรับข้อมูลหลายปีที่เก็บแยกไฟล์) รองรับ filter_years แบบ range",
  usage:
    '[TOOL_CALL: multi_csv_reader(file_ids="id1,id2,id3", filter_years="2565-2567", filter_keyword="อุบลราชธานี")]',

  async execute(args: ToolArgs, appUrl: string): Promise<ToolResult> {
    const { file_ids, filter_years, filter_keyword } = args;

    if (!file_ids) return { success: false, data: "ต้องระบุ file_ids (comma-separated จาก file_finder)" };

    const ids = file_ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return { success: false, data: "ไม่พบ file_ids ที่ถูกต้อง" };

    const yearFilter = buildYearFilter(filter_years ?? "");
    const kwLower = (filter_keyword ?? "").toLowerCase();

    const sections: string[] = [];
    let totalFilesRead = 0;
    let totalRowsFound = 0;

    for (const file_id of ids.slice(0, 10)) {
      // Metadata
      let meta: FileMeta | null = null;
      try {
        const r = await fetch(`${appUrl}/api/files/${file_id}?meta=1`);
        if (r.ok) meta = (await r.json()) as FileMeta;
      } catch { /* skip */ }

      // Content
      let text = "";
      try {
        const r = await fetch(`${appUrl}/api/files/${file_id}`);
        if (!r.ok) { sections.push(`❌ ID ${file_id}: อ่านไม่ได้`); continue; }
        text = await r.text();
      } catch { sections.push(`❌ ID ${file_id}: เกิดข้อผิดพลาด`); continue; }

      const allLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (allLines.length === 0) { sections.push(`⚠️ ID ${file_id}: ไฟล์ว่าง`); continue; }

      const headers = splitLine(allLines[0]);
      const dataLines = allLines.slice(1);

      // Smart filter with fallback
      const { filtered, note } = smartFilter(dataLines, yearFilter, kwLower);

      totalFilesRead++;
      totalRowsFound += filtered.length;

      const sourceName = meta?.name ?? `ID:${file_id}`;
      const sourcePath = meta ? ` | path: ${meta.path}` : "";
      const fileUrl = `/api/files/${file_id}`;

      sections.push(
        `📄 SOURCE: [${sourceName}](${fileUrl})${sourcePath} | URL: ${fileUrl}\n` +
        `   คอลัมน์ (${headers.length}): ${headers.join(" | ")}\n` +
        `   ${note} → ${filtered.length} แถว (จาก ${dataLines.length} ทั้งหมด)\n` +
        `   ${headers.join(",")}\n` +
        filtered.slice(0, 30).map((r) => `   ${r}`).join("\n"),
      );
    }

    const lines = [
      `📊 สรุป: อ่าน ${totalFilesRead}/${ids.length} ไฟล์ พบข้อมูล ${totalRowsFound} แถวรวม`,
      `⚠️ ใช้ตัวเลขจาก SOURCE FILE ข้างต้นเท่านั้น ห้ามแต่งข้อมูล`,
      "",
      ...sections,
    ];

    return { success: totalFilesRead > 0, data: lines.join("\n") };
  },
};

export default multiCsvReader;
