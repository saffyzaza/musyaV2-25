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

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getMessageContent(data: unknown): string {
  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object" && "text" in p) return String((p as { text?: unknown }).text ?? "");
        return "";
      })
      .join("\n");
  }
  return "";
}

async function callLLM(messages: { role: string; content: string }[], temperature = 0.4): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY!;
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": APP_URL,
      "X-Title": APP_TITLE,
    },
    body: JSON.stringify({ model: MODEL, temperature, messages }),
  });
  const payload = (await res.json()) as unknown;
  if (!res.ok) {
    const msg = (payload as { error?: { message?: string } })?.error?.message;
    throw new Error(msg || "OpenRouter error");
  }
  return getMessageContent(payload).trim();
}

function parseJson<T>(raw: string): T {
  const m = raw.match(/```json\s*([\s\S]*?)\s*```/) || raw.match(/```\s*([\s\S]*?)\s*```/);
  return JSON.parse(m ? m[1] : raw) as T;
}

const splitCsvLine = (line: string): string[] =>
  line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── CSV Finder types ─────────────────────────────────────────────────────────

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
  headers: string[];   // AI-selected columns only
  sampleRows: string[][];
  totalRows: number;
};

type ColumnAnalysis = {
  relevant_columns: string[];  // subset of headers the AI wants
  filter_keywords: string[];   // row filter values (province, year, etc.)
  reasoning: string;
};

// ─── Step 1: scan headers only ───────────────────────────────────────────────

async function scanCsvHeaders(fileId: string): Promise<{ headers: string[]; allLines: string[] }> {
  const text = await fetch(`${APP_URL}/api/files/${fileId}`).then((r) => r.text());
  const allLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return { headers: splitCsvLine(allLines[0] || ""), allLines };
}

// ─── Step 2: AI decides columns + keywords ───────────────────────────────────

async function analyzeColumnsWithLLM(
  headers: string[],
  filename: string,
  query: string,
): Promise<ColumnAnalysis> {
  try {
    const raw = await callLLM(
      [
        {
          role: "system",
          content:
            "คุณเป็น AI วิเคราะห์โครงสร้าง CSV ตอบ JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON",
        },
        {
          role: "user",
          content: `ไฟล์ CSV: "${filename}"
คอลัมน์ทั้งหมด (${headers.length} คอลัมน์): ${headers.join(" | ")}

คำถามของผู้ใช้: "${query}"

ดูคอลัมน์แล้วตัดสินใจว่าจะดึงอะไรมาบ้าง ตอบ JSON:
{
  "relevant_columns": ["ชื่อคอลัมน์ที่ต้องใช้ตอบคำถาม"],
  "filter_keywords": ["ค่าที่ใช้กรองแถว เช่น 'อุบล' 'อุบลราชธานี' '2022' '2023' '2024' '2025'"],
  "reasoning": "อธิบายว่าเลือกคอลัมน์อะไรและ filter ด้วยอะไร เพราะอะไร"
}`,
        },
      ],
      0.1,
    );

    const parsed = parseJson<ColumnAnalysis>(raw);
    return {
      relevant_columns:
        Array.isArray(parsed.relevant_columns) && parsed.relevant_columns.length > 0
          ? parsed.relevant_columns
          : headers,
      filter_keywords:
        Array.isArray(parsed.filter_keywords) && parsed.filter_keywords.length > 0
          ? parsed.filter_keywords
          : [],
      reasoning: parsed.reasoning || "",
    };
  } catch {
    // Fallback: all columns, no filter
    return { relevant_columns: headers, filter_keywords: [], reasoning: "fallback — ดึงทั้งหมด" };
  }
}

// ─── Step 3: fetch & filter rows ─────────────────────────────────────────────

function fetchFilteredRows(
  allLines: string[],
  headers: string[],
  analysis: ColumnAnalysis,
  maxMatchedRows = 150,
): { filteredHeaders: string[]; filteredRows: string[][]; matchedCount: number } {
  const dataLines = allLines.slice(1);
  const kwLower = analysis.filter_keywords.map((k) => k.toLowerCase());

  // Row filtering
  const first10 = dataLines.slice(0, 10);
  const matched =
    kwLower.length > 0
      ? dataLines.filter((line) => kwLower.some((kw) => line.toLowerCase().includes(kw)))
      : dataLines.slice(0, maxMatchedRows);

  const first10Set = new Set(first10);
  const uniqueMatched = matched.filter((l) => !first10Set.has(l)).slice(0, maxMatchedRows);
  const combinedLines = [...first10, ...uniqueMatched];

  // Column selection
  const relevantIndices = analysis.relevant_columns
    .map((col) => headers.findIndex((h) => h.toLowerCase().trim() === col.toLowerCase().trim()))
    .filter((i) => i !== -1);
  const colIndices = relevantIndices.length > 0 ? relevantIndices : headers.map((_, i) => i);

  const filteredHeaders = colIndices.map((i) => headers[i]);
  const filteredRows = combinedLines.map((line) => {
    const cells = splitCsvLine(line);
    return colIndices.map((i) => cells[i] ?? "");
  });

  return { filteredHeaders, filteredRows, matchedCount: matched.length };
}

// ─── File domain analysis (LLM-based) ────────────────────────────────────────

type FileDomainResult = {
  file_domains: Record<string, string>; // fileId → domain label
  relevant_file_ids: string[];
  reasoning: string;
};

async function analyzeFileDomains(
  files: StoredFile[],
  query: string,
): Promise<FileDomainResult> {
  if (files.length === 0) return { file_domains: {}, relevant_file_ids: [], reasoning: "ไม่มีไฟล์" };

  const fileList = files
    .map((f) => `- ID: ${f.id} | path: ${f.path ?? f.name}`)
    .join("\n");

  try {
    const raw = await callLLM(
      [
        {
          role: "system",
          content: "คุณเป็น AI วิเคราะห์ domain ของไฟล์ข้อมูลจากชื่อโฟลเดอร์และชื่อไฟล์ ตอบ JSON เท่านั้น ห้ามมีข้อความอื่น",
        },
        {
          role: "user",
          content: `รายการไฟล์ CSV ในระบบ:
${fileList}

คำถามของผู้ใช้: "${query}"

วิเคราะห์ domain ของแต่ละไฟล์จากชื่อโฟลเดอร์และชื่อไฟล์ แล้วเลือกเฉพาะไฟล์ที่เกี่ยวข้องกับคำถาม ตอบ JSON:
{
  "file_domains": {
    "ID_ไฟล์": "domain ของไฟล์นี้ เช่น 'ข้อมูลการฆ่าตัวตาย', 'อุบัติเหตุทางถนน', 'โรคมะเร็ง'"
  },
  "relevant_file_ids": ["ID ของไฟล์ที่เกี่ยวข้องกับคำถามเท่านั้น ถ้าไม่มีให้ส่ง []"],
  "reasoning": "เหตุผลสั้นๆ ว่า domain ของแต่ละไฟล์คืออะไร และเลือกไฟล์ไหนเพราะอะไร"
}`,
        },
      ],
      0.1,
    );

    const parsed = parseJson<FileDomainResult>(raw);
    return {
      file_domains: parsed.file_domains ?? {},
      relevant_file_ids: Array.isArray(parsed.relevant_file_ids) ? parsed.relevant_file_ids : [],
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    // Fallback: no files selected
    return { file_domains: {}, relevant_file_ids: [], reasoning: "วิเคราะห์ไม่สำเร็จ" };
  }
}

// ─── Main CSV Finder ──────────────────────────────────────────────────────────

async function findCsvFiles(query: string): Promise<{
  files: CsvFileData[];
  csvFinderStep: AgentStep;
}> {
  const files: CsvFileData[] = [];
  let findError = "";
  const allReasonings: string[] = [];
  const toolDetails: string[] = [];
  let domainAnalysis: FileDomainResult = { file_domains: {}, relevant_file_ids: [], reasoning: "" };

  try {
    const listRes = await fetch(`${APP_URL}/api/files`);
    if (!listRes.ok) {
      findError = "ไม่สามารถเชื่อมต่อ API ไฟล์";
    } else {
      const allFiles = (await listRes.json()) as StoredFile[];
      const allCsvFiles = allFiles.filter(
        (f) => f.previewKind === "csv" || f.extension?.toLowerCase() === "csv",
      );

      // AI analyzes domain of each file from folder+filename, then picks relevant ones
      domainAnalysis = await analyzeFileDomains(allCsvFiles, query);

      const csvFiles = allCsvFiles
        .filter((f) => domainAnalysis.relevant_file_ids.includes(f.id))
        .slice(0, 2);

      console.log(
        `[CSV Finder] domains: ${JSON.stringify(domainAnalysis.file_domains)} → selected: ${csvFiles.map((f) => f.name).join(", ") || "none"}`,
      );

      for (const file of csvFiles) {
        try {
          // Step 1: scan headers
          const { headers, allLines } = await scanCsvHeaders(file.id);
          const totalRows = allLines.length - 1;

          // Step 2: AI analyzes columns
          const analysis = await analyzeColumnsWithLLM(headers, file.name, query);
          allReasonings.push(analysis.reasoning);

          // Step 3: filter rows + select columns
          const { filteredHeaders, filteredRows, matchedCount } = fetchFilteredRows(
            allLines,
            headers,
            analysis,
          );

          files.push({
            id: file.id,
            name: file.name,
            headers: filteredHeaders,
            sampleRows: filteredRows,
            totalRows,
          });

          toolDetails.push(
            `${file.name}: เลือก ${filteredHeaders.length} คอลัมน์ จาก ${headers.length} · ` +
              `กรองด้วย [${analysis.filter_keywords.join(", ")}] → ${matchedCount} แถวที่ตรง · ส่ง ${filteredRows.length} แถว`,
          );

          console.log(
            `[CSV Finder] ${file.name} | cols ${filteredHeaders.join(",")} | matched ${matchedCount}/${totalRows}`,
          );
        } catch {
          /* skip unreadable */
        }
      }
    }
  } catch {
    findError = "เกิดข้อผิดพลาดในการค้นหาไฟล์";
  }

  // Build domain summary for display
  const domainLines = Object.entries(domainAnalysis.file_domains)
    .map(([id, domain]) => {
      const f = files.find((x) => x.id === id) ?? { name: id };
      return `• ${f.name}: ${domain}`;
    })
    .join("\n");

  const csvFinderStep: AgentStep = {
    agentName: "CSV Finder",
    agentRole: "ค้นหาและโหลดไฟล์ข้อมูล",
    thinking:
      files.length > 0
        ? `① AI วิเคราะห์ domain จากชื่อโฟลเดอร์/ไฟล์ทุกไฟล์\n${domainLines}\n\n② เลือกเฉพาะไฟล์ที่ตรงกับคำถาม: ${files.map((f) => f.name).join(", ")}\n③ สแกน headers → AI เลือกคอลัมน์ → กรองแถว`
        : `① AI วิเคราะห์ domain ของไฟล์ทั้งหมด\n${domainLines || "ไม่พบไฟล์ CSV"}\n\n② ${findError || "ไม่มีไฟล์ที่เกี่ยวข้องกับคำถามนี้"}`,
    tool: {
      name: "analyze_and_fetch",
      displayName: "AI วิเคราะห์ domain → เลือกไฟล์ → ดึงข้อมูล",
      input: `วิเคราะห์ domain จาก path+filename:\n${domainLines || "ไม่พบไฟล์ CSV"}\n\nเหตุผล: ${domainAnalysis.reasoning}`,
      output: files.length > 0 ? toolDetails.join("\n") : "ไม่มีไฟล์ที่เกี่ยวข้อง",
    },
    result:
      files.length > 0
        ? `ได้ข้อมูลจาก ${files.length} ไฟล์ — ส่งให้ Orchestrator วิเคราะห์`
        : "ไม่มีไฟล์ CSV ที่เกี่ยวข้อง ใช้ความรู้ทั่วไปแทน",
    status: "done",
  };

  return { files, csvFinderStep };
}

// ─── Format CSV context for main LLM ─────────────────────────────────────────

function formatCsvContext(files: CsvFileData[]): string {
  if (files.length === 0) return "";
  let ctx = "\n\n## ข้อมูล CSV ที่เลือกมาแล้ว (ใช้ข้อมูลนี้ในการวิเคราะห์):\n";
  for (const f of files) {
    ctx += `\n### ไฟล์: ${f.name}  (ทั้งหมด ${f.totalRows} แถว · แสดง ${f.sampleRows.length} แถวที่เกี่ยวข้อง)\n`;
    ctx += `คอลัมน์: ${f.headers.join(" | ")}\n`;
    ctx += f.headers.join(",") + "\n";
    for (const row of f.sampleRows) {
      ctx += row.join(",") + "\n";
    }
  }
  return ctx;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(csvContext: string): string {
  const hasCsv = csvContext.length > 0;

  const researcherToolInput = hasCsv
    ? `Python pandas code ที่ใช้ดึงข้อมูลตามคำถาม เช่น:
\`\`\`python
import pandas as pd

df = pd.read_csv('ชื่อไฟล์.csv')
result = df[(df['province'] == 'ค่าจังหวัด') & (df['year'].between(2022, 2025))]
print(result.groupby(['year'])[['คอลัมน์ที่สนใจ']].sum().to_string())
\`\`\`
(เขียน code จริงตามคอลัมน์และข้อมูลที่ได้รับ)`
    : "คำค้นหาหรือหัวข้อที่ต้องการความรู้";

  return `คุณคือระบบ Multi-Agent AI ช่วยงานด้านสุขภาพและข้อมูลสาธารณสุข${csvContext}

ตอบในรูปแบบ JSON เท่านั้น ห้ามมีข้อความนอก JSON:
{
  "orchestrator_thinking": "วิเคราะห์คำถาม${hasCsv ? "และข้อมูล CSV ที่ CSV Finder เลือกมาให้ ระบุชื่อคอลัมน์จริงที่เห็น" : ""}",
  "orchestrator_delegation": "มอบหมายให้ Research Agent วิเคราะห์",
  "researcher_thinking": "${hasCsv ? "วิเคราะห์โครงสร้าง CSV และเขียน pandas code เพื่อดึงข้อมูลตามที่ต้องการ" : "ค้นหาข้อมูลที่เกี่ยวข้อง"}",
  "researcher_tool": "${hasCsv ? "data_analysis" : "knowledge_search"}",
  "researcher_tool_input": "${researcherToolInput.replace(/\n/g, "\\n").replace(/"/g, '\\"')}",
  "researcher_findings": "${hasCsv ? "สรุปผลที่ได้จาก code เช่น 'พบข้อมูล X แถว ปี 2022: N ราย ปี 2023: M ราย...'" : "สรุปข้อมูลที่ค้นพบ"}",
  "synthesizer_thinking": "รวบรวมและสรุปเป็นคำตอบ",
  "synthesizer_summary": "สรุป 1 ประโยค",
  "finalAnswer": "คำตอบฉบับสมบูรณ์ใน Markdown${hasCsv ? " อ้างอิงตัวเลขจริงจากข้อมูล CSV ถ้ามีตัวเลขหลายปีให้แสดงเป็นตาราง markdown" : " ถ้ามีตัวเลขให้แสดงเป็นตาราง"}"
}

researcher_tool ต้องเป็นหนึ่งใน: knowledge_search, data_analysis, clinical_guidelines, statistics_tool, nutrition_database, disease_surveillance
กรณีอาการรุนแรงหรือวินิจฉัยโรค: แนะนำพบแพทย์ใน finalAnswer`;
}

// ─── Parse main LLM response ──────────────────────────────────────────────────

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
  const fallback = (msg: string): ParsedAgentResult => ({
    message: msg,
    orchestratorStep: { agentName: "Orchestrator", agentRole: "วิเคราะห์และประสานงาน", thinking: "วิเคราะห์คำถาม", result: "มอบหมายให้ Research Agent" },
    researchStep: {
      agentName: "Research Agent", agentRole: "ค้นหาและวิเคราะห์ข้อมูล",
      thinking: hasCsv ? "วิเคราะห์ข้อมูล CSV" : "ค้นหาข้อมูล",
      tool: { name: hasCsv ? "data_analysis" : "knowledge_search", displayName: hasCsv ? "วิเคราะห์ข้อมูล CSV" : "ค้นหาความรู้", input: "คำถามของผู้ใช้", output: msg.slice(0, 120) },
      result: "รวบรวมข้อมูลเรียบร้อย",
    },
    synthesizerStep: { agentName: "Synthesizer", agentRole: "สรุปและจัดรูปแบบ", thinking: "สรุปคำตอบ", result: "เสร็จแล้ว" },
  });

  try {
    const p = parseJson<Record<string, string>>(content);
    if (!p.finalAnswer) return fallback(content);
    return {
      message: p.finalAnswer,
      orchestratorStep: { agentName: "Orchestrator", agentRole: "วิเคราะห์และประสานงาน", thinking: p.orchestrator_thinking || "", result: p.orchestrator_delegation || "" },
      researchStep: {
        agentName: "Research Agent", agentRole: "ค้นหาและวิเคราะห์ข้อมูล",
        thinking: p.researcher_thinking || "",
        tool: p.researcher_tool
          ? { name: p.researcher_tool, displayName: TOOL_DISPLAY_NAMES[p.researcher_tool] || p.researcher_tool, input: p.researcher_tool_input || "", output: p.researcher_findings || "" }
          : null,
        result: p.researcher_findings || "",
      },
      synthesizerStep: { agentName: "Synthesizer", agentRole: "สรุปและจัดรูปแบบคำตอบ", thinking: p.synthesizer_thinking || "", result: p.synthesizer_summary || "" },
    };
  } catch {
    return fallback(content);
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const body = (await request.json()) as ChatRouteRequest;
        const prompt = body.prompt?.trim();

        if (!body.sessionId || !prompt) {
          send({ type: "error", message: "sessionId and prompt are required" });
          return;
        }
        if (!process.env.OPENROUTER_API_KEY) {
          send({ type: "error", message: "ยังไม่ได้ตั้งค่า OPENROUTER_API_KEY ใน .env.local" });
          return;
        }

        // 1. CSV Finder starts immediately
        send({ type: "agent_start", agentName: "CSV Finder", agentRole: "ค้นหาและโหลดไฟล์ข้อมูล" });

        // 2. Scan → AI analyzes columns → fetch filtered rows
        const { files: csvFiles, csvFinderStep } = await findCsvFiles(prompt);
        send({ type: "agent_done", step: csvFinderStep });
        await sleep(300);

        // 3. Orchestrator
        send({ type: "agent_start", agentName: "Orchestrator", agentRole: "วิเคราะห์และประสานงาน" });

        const csvContext = formatCsvContext(csvFiles);
        const historyText = formatHistory(body.history ?? []);
        const fullPrompt = [
          historyText ? `บริบทก่อนหน้า:\n${historyText}` : "",
          `คำถามล่าสุด: ${prompt}`,
        ].filter(Boolean).join("\n\n");

        const raw = await callLLM([
          { role: "system", content: buildSystemPrompt(csvContext) },
          { role: "user", content: fullPrompt },
        ]);

        const { message, orchestratorStep, researchStep, synthesizerStep } =
          parseMultiAgentResponse(raw, csvFiles.length > 0);

        send({ type: "agent_done", step: { ...orchestratorStep, status: "done" } });
        await sleep(300);

        // 4. Research Agent
        send({ type: "agent_start", agentName: "Research Agent", agentRole: "ค้นหาและวิเคราะห์ข้อมูล" });
        await sleep(900);
        send({ type: "agent_done", step: { ...researchStep, status: "done" } });
        await sleep(300);

        // 5. Synthesizer
        send({ type: "agent_start", agentName: "Synthesizer", agentRole: "สรุปและจัดรูปแบบคำตอบ" });
        await sleep(700);
        send({ type: "agent_done", step: { ...synthesizerStep, status: "done" } });
        await sleep(200);

        // 6. Final
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
        console.error("Chat SSE error:", error);
        send({ type: "error", message: error instanceof Error ? error.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
