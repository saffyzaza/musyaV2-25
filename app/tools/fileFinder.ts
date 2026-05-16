import type { ExecutableTool, ToolArgs, ToolResult } from "./types";

type StoredFile = { id: string; name: string; path: string; extension: string; previewKind: string };

const norm = (s: string) => s.toLowerCase().trim();

// Expand year range "2565-2567" → ["2565","2566","2567"]
// or single year "2565" → ["2565"]
function expandYears(year: string): string[] {
  const range = year.match(/^(\d{4})-(\d{4})$/);
  if (range) {
    const from = parseInt(range[1]);
    const to   = parseInt(range[2]);
    return Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
  }
  return year ? [year] : [];
}

function pathMatches(fullPath: string, term: string): boolean {
  const p = norm(fullPath);
  const t = norm(term);
  if (p.includes(t)) return true;

  const PROVINCE_EXPAND: Record<string, string[]> = {
    อุบล:        ["อุบลราชธานี"],
    "ขอนแก่น":   ["ขอนแก่น"],
    "เชียงใหม่": ["เชียงใหม่"],
    กทม:         ["กรุงเทพ", "bangkok"],
    nakhon:      ["นครราชสีมา", "nakhon"],
  };
  for (const [short, expansions] of Object.entries(PROVINCE_EXPAND)) {
    if (t === norm(short)) return expansions.some((e) => p.includes(norm(e)));
  }
  return false;
}

const fileFinder: ExecutableTool = {
  name: "file_finder",
  description: "ค้นหาไฟล์ CSV ใน MinIO โดยระบุ domain, province, disease และ year (รองรับ range เช่น 2565-2567)",
  usage:
    '[TOOL_CALL: file_finder(domain="D3_NCDs", province="อุบลราชธานี", disease="โรคเบาหวาน", year="2565-2567")]',

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

    const csvFiles = files.filter(
      (f) => f.previewKind === "csv" || f.extension?.toLowerCase() === "csv",
    );

    // Expand year range → individual terms
    const yearTerms = expandYears(year ?? "");
    // Non-year search terms (must ALL match)
    const baseTerms = [domain, province, disease].filter(Boolean);
    // All search terms for display
    const allTerms = [...baseTerms, ...yearTerms];

    const scored = csvFiles.map((f) => {
      const fullPath = `${f.path ?? ""}/${f.name}`;

      // All base terms must match (domain + province + disease)
      const baseMatch = baseTerms.every((t) => pathMatches(fullPath, t));
      if (!baseMatch) return { f, fullPath, score: 0, yearMatch: false };

      // Year: any year in the expanded range matches → include
      const yearMatch = yearTerms.length === 0 || yearTerms.some((y) => pathMatches(fullPath, y));
      const score = baseTerms.filter((t) => pathMatches(fullPath, t)).length +
                    (yearMatch ? 1 : 0);

      return { f, fullPath, score, yearMatch };
    });

    // Include files that match all base terms (even if year not in filename)
    const best = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => {
        // Prioritize year-matched files, then by score
        if (a.yearMatch !== b.yearMatch) return a.yearMatch ? -1 : 1;
        return b.score - a.score;
      });

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
      (s) =>
        `- ID: ${s.f.id} | ชื่อ: ${s.f.name} | path: ${s.f.path}${s.yearMatch ? " ✓ปีตรง" : " (ปีไม่ระบุในชื่อไฟล์)"}`,
    );

    return {
      success: true,
      data:
        `พบ ${best.length} ไฟล์ (year="${year}" → ค้นหาปี: ${yearTerms.join(",")||"ทั้งหมด"}):\n` +
        lines.join("\n") +
        `\n\n→ ส่ง IDs ทั้งหมดให้ multi_csv_reader: ${best.map((s) => s.f.id).join(",")}`,
    };
  },
};

export default fileFinder;
