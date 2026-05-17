import type { ExecutableTool, ToolArgs, ToolResult, AIHelper } from "./types";

type StoredFile = { id: string; name: string; path: string; extension: string; previewKind: string };

type AIFileSelection = {
  relevant_ids: string[];
  reasoning: string;
};

// ─── AI-powered file analysis ─────────────────────────────────────────────────

async function selectFilesWithAI(
  files: StoredFile[],
  query: string,
  callAI: AIHelper,
): Promise<AIFileSelection> {
  const fileList = files
    .map((f) => `ID: ${f.id} | path: ${f.path ?? ""}/${f.name}`)
    .join("\n");

  const raw = await callAI(
    "คุณเป็น AI เลือกไฟล์ CSV ที่เกี่ยวข้องกับ query ตอบ JSON เท่านั้น ห้ามมีข้อความอื่น",
    `Query ของผู้ใช้: "${query}"

รายการไฟล์ CSV ทั้งหมดในระบบ:
${fileList}

วิเคราะห์ชื่อโฟลเดอร์ ชื่อไฟล์ และ path แล้วเลือกไฟล์ที่น่าจะมีข้อมูลตรงกับ query
ถ้าไฟล์มีชื่อว่า "ทุกจังหวัด" หรือ "merged" หรือ "all_provinces" ให้รวมไว้ถ้า domain ตรง

ตอบ JSON:
{
  "relevant_ids": ["ID ของไฟล์ที่เกี่ยวข้อง (ถ้าไม่มีให้ส่ง [])"],
  "reasoning": "เหตุผลสั้นๆ ว่าเลือกไฟล์ไหนและทำไม"
}`,
  );

  try {
    const m = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/```\s*([\s\S]*?)\s*```/);
    const parsed = JSON.parse(m ? m[1] : raw) as AIFileSelection;
    return {
      relevant_ids: Array.isArray(parsed.relevant_ids) ? parsed.relevant_ids : [],
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    // Fallback: try to extract IDs from raw text
    const ids = [...raw.matchAll(/ID:\s*(\S+)/g)].map((m) => m[1].replace(/[",]/g, ""));
    return { relevant_ids: ids.slice(0, 5), reasoning: "fallback extraction" };
  }
}

// ─── Tool definition ──────────────────────────────────────────────────────────

const fileFinder: ExecutableTool = {
  name: "file_finder",
  description:
    "ใช้ AI วิเคราะห์รายชื่อไฟล์ CSV ทั้งหมดใน MinIO และเลือกไฟล์ที่เกี่ยวข้องกับ query อัตโนมัติ",
  usage:
    '[TOOL_CALL: file_finder(query="พยายามฆ่าตัวตาย จังหวัดยโสธร ปี 2024")]',

  async execute(args: ToolArgs, appUrl: string, callAI?: AIHelper): Promise<ToolResult> {
    const query = args.query || [args.disease, args.province, args.year, args.domain]
      .filter(Boolean).join(" ");

    if (!query.trim()) {
      return { success: false, data: "ต้องระบุ query หรือ disease/province/year" };
    }

    // 1. List all CSV files
    let files: StoredFile[] = [];
    try {
      const res = await fetch(`${appUrl}/api/files`);
      if (!res.ok) return { success: false, data: "ไม่สามารถเข้าถึงรายการไฟล์ได้" };
      const all = (await res.json()) as StoredFile[];
      files = all.filter((f) => f.previewKind === "csv" || f.extension?.toLowerCase() === "csv");
    } catch {
      return { success: false, data: "เกิดข้อผิดพลาดในการดึงรายการไฟล์" };
    }

    if (files.length === 0) {
      return { success: false, data: "ไม่พบไฟล์ CSV ในระบบ" };
    }

    // 2. AI selects relevant files
    let selection: AIFileSelection = { relevant_ids: [], reasoning: "" };

    if (callAI) {
      selection = await selectFilesWithAI(files, query, callAI);
    } else {
      // Fallback: simple keyword match if no AI available
      const qLower = query.toLowerCase();
      const matched = files.filter((f) => {
        const p = `${f.path ?? ""}/${f.name}`.toLowerCase();
        return qLower.split(/\s+/).some((w) => w.length > 2 && p.includes(w));
      });
      selection = {
        relevant_ids: matched.slice(0, 5).map((f) => f.id),
        reasoning: "keyword fallback (ไม่มี AI helper)",
      };
    }

    if (selection.relevant_ids.length === 0) {
      const allPaths = files.slice(0, 20).map((f) => `${f.path}/${f.name}`).join("\n");
      return {
        success: false,
        data:
          `AI ไม่พบไฟล์ที่เกี่ยวข้องกับ: "${query}"\nเหตุผล: ${selection.reasoning}\n\nไฟล์ทั้งหมด:\n${allPaths}`,
      };
    }

    // 3. Build result with matched file details
    const matchedFiles = files.filter((f) => selection.relevant_ids.includes(f.id));
    const lines = matchedFiles.map(
      (f) => `- ID: ${f.id} | ชื่อ: ${f.name} | path: ${f.path}`,
    );

    return {
      success: true,
      data:
        `AI เลือกไฟล์ที่เกี่ยวข้อง ${matchedFiles.length} ไฟล์:\n` +
        `เหตุผล: ${selection.reasoning}\n\n` +
        lines.join("\n") +
        `\n\n→ ส่ง IDs ให้ multi_csv_reader: ${matchedFiles.map((f) => f.id).join(",")}`,
    };
  },
};

export default fileFinder;
