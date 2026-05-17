import type { ExecutableTool, ToolArgs, ToolResult } from "./types";

type StoredFile = { id: string; name: string; path: string; extension: string; previewKind: string };

const norm = (s: string) => s.toLowerCase().trim();

// ─── Year helpers ─────────────────────────────────────────────────────────────

// Convert CE ↔ BE (Thai): 2024 CE = 2567 BE
function ceToThai(y: number) { return y + 543; }
function thaiToCE(y: number) { return y - 543; }

// Expand a year (single or range) to all relevant year strings (CE + BE)
function expandYears(year: string): string[] {
  if (!year) return [];

  const range = year.match(/^(\d{4})-(\d{4})$/);
  if (range) {
    const from = parseInt(range[1]);
    const to   = parseInt(range[2]);
    const years: string[] = [];
    for (let y = from; y <= to; y++) {
      years.push(String(y));
      // Add the other calendar system variant
      const other = y > 2100 ? thaiToCE(y) : ceToThai(y);
      years.push(String(other));
    }
    return [...new Set(years)];
  }

  const y = parseInt(year);
  if (isNaN(y)) return [year];
  const other = y > 2100 ? thaiToCE(y) : ceToThai(y);
  return [String(y), String(other)];
}

// Check if the filename contains a year RANGE (e.g. "2022_2025" or "2022-2025")
// and the target year falls within that range
function yearInFileRange(fullPath: string, yearStr: string): boolean {
  const y = parseInt(yearStr);
  if (isNaN(y)) return false;

  const rangeMatch = fullPath.match(/(\d{4})[_-](\d{4})/);
  if (!rangeMatch) return false;

  const from = parseInt(rangeMatch[1]);
  const to   = parseInt(rangeMatch[2]);
  // Handle both CE and BE: try direct match and cross-calendar match
  const otherY = y > 2100 ? thaiToCE(y) : ceToThai(y);
  return (y >= from && y <= to) || (otherY >= from && otherY <= to);
}

// ─── Province / disease synonyms ─────────────────────────────────────────────

const SYNONYM_MAP: Record<string, string[]> = {
  // Provinces
  อุบล:           ["อุบลราชธานี", "ubon"],
  มุกดาหาร:       ["mukdahan"],
  "ขอนแก่น":      ["khon_kaen", "khonkaen"],
  "เชียงใหม่":    ["chiangmai", "chiang_mai"],
  กทม:            ["กรุงเทพ", "bangkok"],
  "นครราชสีมา":   ["nakhon", "korat"],
  "อำนาจเจริญ":   ["amnat", "amnatcharoen"],
  "ศรีสะเกษ":     ["sisaket", "si_saket"],
  "ยโสธร":        ["yasothon"],
  "ร้อยเอ็ด":     ["roi_et", "roiet"],
  "สุรินทร์":     ["surin"],
  "บุรีรัมย์":    ["buriram"],
  "ชัยภูมิ":      ["chaiyaphum"],
  "หนองบัวลำภู":  ["nong_bua"],
  "นครพนม":       ["nakhon_phanom"],
  "สกลนคร":       ["sakon_nakhon"],
  // Diseases
  "ฆ่าตัวตาย":    ["suicide", "suicid", "self_harm"],
  "พยายามฆ่าตัวตาย": ["suicide_attempt", "suicide_attempts", "attempt"],
  อุบัติเหตุ:     ["accident", "road", "crash"],
  มะเร็ง:         ["cancer"],
  เบาหวาน:        ["diabetes"],
  "ความดัน":      ["hypertension", "blood_pressure"],
  ไต:             ["kidney", "renal"],
  หัวใจ:          ["heart", "cardiac"],
};

function pathMatches(fullPath: string, term: string): boolean {
  const p = norm(fullPath);
  const t = norm(term);
  if (p.includes(t)) return true;

  // Check synonyms
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    if (t === norm(key)) {
      return synonyms.some((s) => p.includes(norm(s)));
    }
    // Reverse: if term is an English synonym, match Thai key
    if (synonyms.some((s) => t === norm(s))) {
      return p.includes(norm(key)) || synonyms.some((s) => p.includes(norm(s)));
    }
  }
  return false;
}

// ─── Tool definition ──────────────────────────────────────────────────────────

const fileFinder: ExecutableTool = {
  name: "file_finder",
  description: "ค้นหาไฟล์ CSV ใน MinIO รองรับ year range, CE↔BE แปลงอัตโนมัติ และ province/disease synonyms",
  usage:
    '[TOOL_CALL: file_finder(domain="D2_Mental_Health", province="มุกดาหาร", disease="พยายามฆ่าตัวตาย", year="2024")]',

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

    const yearTerms = expandYears(year ?? "");
    const baseTerms = [domain, province, disease].filter(Boolean);

    const scored = csvFiles.map((f) => {
      const fullPath = `${f.path ?? ""}/${f.name}`;

      // Base terms: domain + province + disease — all must match
      const baseMatch = baseTerms.every((t) => pathMatches(fullPath, t));
      if (!baseMatch) return { f, fullPath, score: 0, yearMatch: false, rangeMatch: false };

      // Year matching: exact OR within a file's year range (e.g. "2022_2025" covers 2024)
      const yearExact = yearTerms.length === 0 || yearTerms.some((y) => pathMatches(fullPath, y));
      const rangeMatch = yearTerms.length > 0 && yearTerms.some((y) => yearInFileRange(fullPath, y));
      const yearMatch = yearExact || rangeMatch;

      const score =
        baseTerms.filter((t) => pathMatches(fullPath, t)).length +
        (yearExact ? 2 : rangeMatch ? 1 : 0);

      return { f, fullPath, score, yearMatch, rangeMatch };
    });

    const best = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (best.length === 0) {
      const allCsvPaths = csvFiles.slice(0, 20).map((f) => `${f.path}/${f.name}`).join("\n");
      return {
        success: false,
        data:
          `ไม่พบไฟล์: domain="${domain}" province="${province}" disease="${disease}" year="${year}" (ลอง CE+BE: ${yearTerms.join(",")})\n` +
          `ไฟล์ CSV ที่มีในระบบ:\n${allCsvPaths}`,
      };
    }

    const lines = best.map((s) => {
      const tag = s.rangeMatch ? " ✓ปีอยู่ใน range ของไฟล์" : s.yearMatch ? " ✓ปีตรง" : "";
      return `- ID: ${s.f.id} | ชื่อ: ${s.f.name} | path: ${s.f.path}${tag}`;
    });

    const ceBeNote = yearTerms.length > 0
      ? ` (ค้นทั้ง CE+BE: ${yearTerms.join(",")})`
      : "";

    return {
      success: true,
      data:
        `พบ ${best.length} ไฟล์${ceBeNote}:\n` +
        lines.join("\n") +
        `\n\n→ ส่ง IDs ทั้งหมดให้ multi_csv_reader: ${best.map((s) => s.f.id).join(",")}`,
    };
  },
};

export default fileFinder;
