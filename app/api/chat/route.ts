import type { ChatRouteRequest, AgentStep } from "@/app/chat/chatTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const APP_TITLE = "Musya Chat";

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  knowledge_search: "ค้นหาความรู้สุขภาพ",
  data_analysis: "วิเคราะห์ข้อมูล CSV",
  clinical_guidelines: "แนวทางทางคลินิก",
  statistics_tool: "วิเคราะห์สถิติสาธารณสุข",
  nutrition_database: "ฐานข้อมูลโภชนาการ",
  disease_surveillance: "ระบบเฝ้าระวังโรค",
};

// ─── CSV Finder types & helpers ───────────────────────────────────────────────

type StoredFile = {
  id: string;
  name: string;
  extension: string;
  previewKind: string;
  size: number;
};

type CsvFileData = {
  id: string;
  name: string;
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
};

const splitCsvLine = (line: string): string[] =>
  line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());

// Extract short keywords (≥2 chars, no stopwords) from a Thai+English query
function extractKeywords(query: string): string[] {
  const stopwords = new Set(["ขอ", "ข้อมูล", "การ", "ให้", "และ", "ใน", "ปี", "จาก", "ที่", "ของ", "มี", "a", "the", "of", "in", "for", "and", "data"]);
  return query
    .replace(/[()[\]{}'"""'']/g, " ")
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !stopwords.has(w));
}

// Smart read: headers + first 10 rows + ALL rows matching any query keyword
function parseSmartRows(
  csvText: string,
  keywords: string[],
  maxMatchedRows = 150,
): { headers: string[]; sampleRows: string[][]; matchedCount: number } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], sampleRows: [], matchedCount: 0 };

  const headers = splitCsvLine(lines[0]);
  const dataLines = lines.slice(1);

  const kwLower = keywords.map((k) => k.toLowerCase());

  const first10 = dataLines.slice(0, 10);
  const matched = dataLines.filter((line) => {
    const lower = line.toLowerCase();
    return kwLower.some((kw) => lower.includes(kw));
  });

  // Deduplicate: matched rows that are already in first10 don't need repeating
  const first10Set = new Set(first10);
  const uniqueMatched = matched.filter((l) => !first10Set.has(l)).slice(0, maxMatchedRows);

  const combined = [...first10, ...uniqueMatched];
  return {
    headers,
    sampleRows: combined.map(splitCsvLine),
    matchedCount: matched.length,
  };
}

function formatCsvContext(files: CsvFileData[]): string {
  if (files.length === 0) return "";
  let ctx = "\n\n## ข้อมูล CSV ที่พบในระบบ (ใช้ข้อมูลนี้ในการวิเคราะห์):\n";
  for (const f of files) {
    ctx += `\n### ไฟล์: ${f.name}  (ทั้งหมด ${f.totalRows} แถวข้อมูล, แสดง ${f.sampleRows.length} แถวที่เกี่ยวข้อง)\n`;
    ctx += `คอลัมน์: ${f.headers.join(" | ")}\n`;
    ctx += `ข้อมูล:\n`;
    ctx += f.headers.join(",") + "\n";
    for (const row of f.sampleRows) {
      ctx += row.join(",") + "\n";
    }
  }
  return ctx;
}

async function findCsvFiles(
  query: string,
): Promise<{ files: CsvFileData[]; csvFinderStep: AgentStep }> {
  let files: CsvFileData[] = [];
  let findError = "";
  const keywords = extractKeywords(query);

  try {
    const listRes = await fetch(`${APP_URL}/api/files`);
    if (listRes.ok) {
      const allFiles = (await listRes.json()) as StoredFile[];
      const csvFiles = allFiles.filter(
        (f) => f.previewKind === "csv" || f.extension?.toLowerCase() === "csv",
      );

      for (const file of csvFiles.slice(0, 3)) {
        try {
          const contentRes = await fetch(`${APP_URL}/api/files/${file.id}`);
          if (!contentRes.ok) continue;
          const text = await contentRes.text();
          const totalRows = text.split(/\r?\n/).filter((l) => l.trim()).length - 1;
          const { headers, sampleRows, matchedCount } = parseSmartRows(text, keywords);
          files.push({ id: file.id, name: file.name, headers, sampleRows: sampleRows.slice(0, 160), totalRows });
          console.log(`[CSV Finder] ${file.name}: ${totalRows} rows total, ${matchedCount} matched keywords [${keywords.join(", ")}], sending ${Math.min(sampleRows.length, 160)} rows`);
        } catch {
          /* skip unreadable file */
        }
      }
    } else {
      findError = "ไม่สามารถเชื่อมต่อ API ไฟล์";
    }
  } catch {
    findError = "เกิดข้อผิดพลาดในการค้นหาไฟล์";
  }

  const csvFinderStep: AgentStep = {
    agentName: "CSV Finder",
    agentRole: "ค้นหาและโหลดไฟล์ข้อมูล",
    thinking:
      files.length > 0
        ? `ค้นหาไฟล์ CSV ในระบบ MinIO พบ ${files.length} ไฟล์ กรองแถวที่ตรงกับคำค้น [${keywords.join(", ")}] แล้วส่งให้ Orchestrator`
        : findError || "ค้นหาไฟล์ CSV ในระบบ MinIO แต่ไม่พบไฟล์ที่เกี่ยวข้อง",
    tool: {
      name: "list_files",
      displayName: "ค้นหาและกรองข้อมูล CSV ใน MinIO",
      input: `ค้นหาไฟล์ CSV · กรองด้วยคำค้น: ${keywords.join(", ")}`,
      output:
        files.length > 0
          ? files
              .map((f) => `${f.name} (${f.headers.length} คอลัมน์, ${f.totalRows} แถวทั้งหมด, ส่ง ${f.sampleRows.length} แถวที่เกี่ยวข้อง)`)
              .join(" | ")
          : "ไม่พบไฟล์ CSV",
    },
    result:
      files.length > 0
        ? `โหลดและกรองข้อมูลจาก ${files.length} ไฟล์เรียบร้อย — ส่งให้ Orchestrator วิเคราะห์`
        : "ไม่พบไฟล์ CSV ใช้ความรู้ทั่วไปแทน",
    status: "done",
  };

  return { files, csvFinderStep };
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(csvContext: string): string {
  return `คุณคือระบบ Multi-Agent AI ช่วยงานด้านสุขภาพและข้อมูลสาธารณสุข${csvContext}

ตอบในรูปแบบ JSON เท่านั้น ห้ามมีข้อความนอก JSON:
{
  "orchestrator_thinking": "วิเคราะห์คำถามและข้อมูลที่มี${csvContext ? " รวมถึงข้อมูล CSV ที่ CSV Finder นำมา" : ""}",
  "orchestrator_delegation": "มอบหมายให้ Research Agent วิเคราะห์ต่อ",
  "researcher_thinking": "วิเคราะห์ข้อมูลที่เกี่ยวข้อง${csvContext ? " จากไฟล์ CSV ที่พบ" : ""}",
  "researcher_tool": "${csvContext ? "data_analysis" : "knowledge_search"}",
  "researcher_tool_input": "รายละเอียดข้อมูลหรือคำค้นหา",
  "researcher_findings": "สรุปผลการวิเคราะห์ข้อมูล",
  "synthesizer_thinking": "รวบรวมและสรุปเป็นคำตอบสุดท้าย",
  "synthesizer_summary": "คำตอบสั้นๆ 1 ประโยค",
  "finalAnswer": "คำตอบฉบับสมบูรณ์ใน Markdown${csvContext ? " อ้างอิงข้อมูลจากไฟล์ CSV ถ้าเกี่ยวข้อง ถ้ามีตัวเลขให้แสดงเป็นตาราง" : " ถ้ามีตัวเลขให้แสดงเป็นตาราง"}"
}

researcher_tool ต้องเป็นหนึ่งใน: knowledge_search, data_analysis, clinical_guidelines, statistics_tool, nutrition_database, disease_surveillance

กรณีคำถามเกี่ยวกับอาการรุนแรงหรือวินิจฉัยโรค: ให้แนะนำพบแพทย์ใน finalAnswer`;
}

// ─── OpenRouter call ──────────────────────────────────────────────────────────

function getMessageContent(data: unknown): string {
  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .join("\n");
  }
  return "";
}

function formatHistory(history: ChatRouteRequest["history"]) {
  return history
    .slice(-8)
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join("\n");
}

type ParsedAgentResult = {
  message: string;
  orchestratorStep: AgentStep;
  researchStep: AgentStep;
  synthesizerStep: AgentStep;
};

function parseMultiAgentResponse(content: string, hasCsv: boolean): ParsedAgentResult {
  const fallback = (message: string): ParsedAgentResult => ({
    message,
    orchestratorStep: {
      agentName: "Orchestrator",
      agentRole: "วิเคราะห์และประสานงาน",
      thinking: "วิเคราะห์คำถามและข้อมูล",
      result: "มอบหมายให้ Research Agent วิเคราะห์ต่อ",
    },
    researchStep: {
      agentName: "Research Agent",
      agentRole: "ค้นหาและวิเคราะห์ข้อมูล",
      thinking: hasCsv ? "วิเคราะห์ข้อมูลจากไฟล์ CSV" : "ค้นหาข้อมูลที่เกี่ยวข้อง",
      tool: {
        name: hasCsv ? "data_analysis" : "knowledge_search",
        displayName: hasCsv ? "วิเคราะห์ข้อมูล CSV" : "ค้นหาความรู้สุขภาพ",
        input: "คำถามของผู้ใช้",
        output: message.slice(0, 120),
      },
      result: "รวบรวมข้อมูลเรียบร้อย",
    },
    synthesizerStep: {
      agentName: "Synthesizer",
      agentRole: "สรุปและจัดรูปแบบคำตอบ",
      thinking: "รวบรวมข้อมูลและจัดรูปแบบคำตอบ",
      result: "คำตอบพร้อมแล้ว",
    },
  });

  try {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const p = JSON.parse(jsonStr.trim()) as Record<string, string>;

    if (!p.finalAnswer) return fallback(content);

    return {
      message: p.finalAnswer,
      orchestratorStep: {
        agentName: "Orchestrator",
        agentRole: "วิเคราะห์และประสานงาน",
        thinking: p.orchestrator_thinking || "",
        result: p.orchestrator_delegation || "",
      },
      researchStep: {
        agentName: "Research Agent",
        agentRole: "ค้นหาและวิเคราะห์ข้อมูล",
        thinking: p.researcher_thinking || "",
        tool: p.researcher_tool
          ? {
              name: p.researcher_tool,
              displayName: TOOL_DISPLAY_NAMES[p.researcher_tool] || p.researcher_tool,
              input: p.researcher_tool_input || "",
              output: p.researcher_findings || "",
            }
          : null,
        result: p.researcher_findings || "",
      },
      synthesizerStep: {
        agentName: "Synthesizer",
        agentRole: "สรุปและจัดรูปแบบคำตอบ",
        thinking: p.synthesizer_thinking || "",
        result: p.synthesizer_summary || "",
      },
    };
  } catch {
    return fallback(content);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const body = (await request.json()) as ChatRouteRequest;
        const prompt = body.prompt?.trim();

        if (!body.sessionId || !prompt) {
          send({ type: "error", message: "sessionId and prompt are required" });
          controller.close();
          return;
        }

        if (!process.env.OPENROUTER_API_KEY) {
          send({
            type: "error",
            message: "ยังไม่ได้ตั้งค่า OpenRouter — เพิ่ม OPENROUTER_API_KEY ใน .env.local",
          });
          controller.close();
          return;
        }

        // 1. CSV Finder starts immediately
        send({ type: "agent_start", agentName: "CSV Finder", agentRole: "ค้นหาและโหลดไฟล์ข้อมูล" });

        // 2. Actually search MinIO for CSV files (smart-filtered by the user's query)
        const { files: csvFiles, csvFinderStep } = await findCsvFiles(prompt);
        send({ type: "agent_done", step: csvFinderStep });
        await sleep(300);

        // 3. Orchestrator starts
        send({ type: "agent_start", agentName: "Orchestrator", agentRole: "วิเคราะห์และประสานงาน" });

        // 4. LLM call with CSV context injected
        const csvContext = formatCsvContext(csvFiles);
        const systemPrompt = buildSystemPrompt(csvContext);

        const historyText = formatHistory(body.history ?? []);
        const fullPrompt = [
          historyText ? `บริบทการสนทนาก่อนหน้า:\n${historyText}` : "",
          `คำถามล่าสุดของผู้ใช้: ${prompt}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        const apiRes = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": APP_URL,
            "X-Title": APP_TITLE,
          },
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.4,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: fullPrompt },
            ],
          }),
        });

        const payload = (await apiRes.json()) as unknown;

        if (!apiRes.ok) {
          const errorMessage = (payload as { error?: { message?: string } })?.error?.message;
          throw new Error(errorMessage || "OpenRouter request failed");
        }

        const content = getMessageContent(payload).trim();
        if (!content) throw new Error("OpenRouter returned an empty response");

        const { message, orchestratorStep, researchStep, synthesizerStep } =
          parseMultiAgentResponse(content, csvFiles.length > 0);

        // 5. Orchestrator done
        send({ type: "agent_done", step: { ...orchestratorStep, status: "done" } });
        await sleep(300);

        // 6. Research Agent
        send({ type: "agent_start", agentName: "Research Agent", agentRole: "ค้นหาและวิเคราะห์ข้อมูล" });
        await sleep(900);
        send({ type: "agent_done", step: { ...researchStep, status: "done" } });
        await sleep(300);

        // 7. Synthesizer
        send({ type: "agent_start", agentName: "Synthesizer", agentRole: "สรุปและจัดรูปแบบคำตอบ" });
        await sleep(700);
        send({ type: "agent_done", step: { ...synthesizerStep, status: "done" } });
        await sleep(200);

        // 8. Final
        send({
          type: "final",
          message,
          agentSteps: [
            { ...csvFinderStep, status: "done" },
            { ...orchestratorStep, status: "done" },
            { ...researchStep, status: "done" },
            { ...synthesizerStep, status: "done" },
          ],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Chat SSE error:", error);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
