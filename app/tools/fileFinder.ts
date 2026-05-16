import type { ExecutableTool, ToolArgs, ToolResult } from "./types";

type StoredFile = { id: string; name: string; path: string; extension: string; previewKind: string };

// Normalize for Thai string comparison (lowercase, trim)
const norm = (s: string) => s.toLowerCase().trim();

// Check if a search term appears in any part of the full file path
function pathMatches(fullPath: string, term: string): boolean {
  const p = norm(fullPath);
  const t = norm(term);
  if (p.includes(t)) return true;

  // Partial Thai province name match: "อุบล" → "อุบลราชธานี"
  const PROVINCE_EXPAND: Record<string, string[]> = {
    อุบล:        ["อุบลราชธานี"],
    "ขอนแก่น":   ["ขอนแก่น"],
    "เชียงใหม่": ["เชียงใหม่"],
    กทม:         ["กรุงเทพ", "bangkok"],
    nakhon:      ["นครราชสีมา", "nakhon"],
  };
  for (const [short, expansions] of Object.entries(PROVINCE_EXPAND)) {
    if (t === norm(short)) {
      return expansions.some((e) => p.includes(norm(e)));
    }
  }
  return false;
}

const fileFinder: ExecutableTool = {
  name: "file_finder",
  description: "ค้นหาไฟล์ CSV ใน MinIO โดยระบุ domain, province, disease, year",
  usage:
    '[TOOL_CALL: file_finder(domain="D3_NCDs", province="อุบลราชธานี", disease="โรคไต", year="2565")]',

  async execute(args: ToolArgs, appUrl: string): Promise<ToolResult> {
    const { domain, province, disease, year } = args;

    let files: StoredFile[] = [];
    try {
      const res = await fetch(`${appUrl}/api/files`);
      if (!res.ok) return { success: false, data: "ไม่สามารถเข้าถึงรายการไฟล์ได้" };
      files = (await res.json()) as StoredFile[];
    } catch {
      return { success: false, data: "เกิดข้อผิดพลาดในการเชื่อมต่อ API" };
    }

    // Only CSV files
    const csvFiles = files.filter(
      (f) => f.previewKind === "csv" || f.extension?.toLowerCase() === "csv",
    );

    const searchTerms = [domain, province, disease, year].filter(Boolean);

    // Score each file: count how many terms match the full path
    const scored = csvFiles.map((f) => {
      const fullPath = `${f.path ?? ""}/${f.name}`;
      const score = searchTerms.filter((t) => pathMatches(fullPath, t)).length;
      return { f, fullPath, score };
    });

    const best = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

    if (best.length === 0) {
      const allCsvPaths = csvFiles.slice(0, 20).map((f) => `${f.path}/${f.name}`).join("\n");
      return {
        success: false,
        data:
          `ไม่พบไฟล์ที่ตรงกับเงื่อนไข: domain="${domain}" province="${province}" disease="${disease}" year="${year}"\n` +
          `ไฟล์ CSV ที่มีในระบบ:\n${allCsvPaths}`,
      };
    }

    const lines = best.map(
      (s) => `- ID: ${s.f.id} | ชื่อ: ${s.f.name} | path: ${s.f.path} | score: ${s.score}/${searchTerms.length}`,
    );

    return {
      success: true,
      data: `พบ ${best.length} ไฟล์ที่ตรงกัน:\n${lines.join("\n")}`,
    };
  },
};

export default fileFinder;
