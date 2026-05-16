import type { ChatRouteRequest, AgentStep } from "@/app/chat/chatTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const APP_TITLE = "Musya Chat";

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  knowledge_search: "ค้นหาความรู้สุขภาพ",
  data_analysis: "วิเคราะห์ข้อมูล",
  clinical_guidelines: "แนวทางทางคลินิก",
  statistics_tool: "วิเคราะห์สถิติสาธารณสุข",
  nutrition_database: "ฐานข้อมูลโภชนาการ",
  disease_surveillance: "ระบบเฝ้าระวังโรค",
};

const SYSTEM_PROMPT = `คุณคือระบบ Multi-Agent AI ช่วยงานด้านสุขภาพและข้อมูลสาธารณสุข

ตอบในรูปแบบ JSON เท่านั้น ห้ามมีข้อความนอก JSON:
{
  "orchestrator_thinking": "วิเคราะห์คำถามสั้นๆ: ผู้ใช้ถามเรื่อง X ต้องการข้อมูลประเภท Y",
  "orchestrator_delegation": "มอบหมายให้ Research Agent ค้นหาข้อมูลเรื่อง X ด้วย tool Y",
  "researcher_thinking": "กำลังค้นหาข้อมูลที่เกี่ยวข้องกับ X",
  "researcher_tool": "knowledge_search",
  "researcher_tool_input": "คำค้นหาหรือข้อมูลที่ input เข้า tool",
  "researcher_findings": "สรุปข้อมูลที่พบจาก tool อย่างย่อ 1-2 ประโยค",
  "synthesizer_thinking": "รวบรวมข้อมูลจาก Research Agent เพื่อสรุปเป็นคำตอบ",
  "synthesizer_summary": "คำตอบสรุปสั้นๆ 1 ประโยค",
  "finalAnswer": "คำตอบฉบับสมบูรณ์ในรูปแบบ Markdown ที่อ่านง่าย ถ้ามีข้อมูลเชิงตัวเลขให้แสดงเป็นตาราง ถ้ามีขั้นตอนให้แสดงเป็น list"
}

researcher_tool ต้องเป็นหนึ่งใน: knowledge_search, data_analysis, clinical_guidelines, statistics_tool, nutrition_database, disease_surveillance

กรณีคำถามเกี่ยวกับอาการรุนแรงหรือวินิจฉัยโรค: ให้แนะนำพบแพทย์ใน finalAnswer`;

function buildConfigurationError() {
  return [
    "ยังไม่ได้ตั้งค่า OpenRouter สำหรับแชต AI",
    "เพิ่ม OPENROUTER_API_KEY ในไฟล์ .env.local แล้ว restart dev server",
  ].join("\n");
}

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

function parseMultiAgentResponse(content: string): ParsedAgentResult {
  const fallback = (message: string): ParsedAgentResult => ({
    message,
    orchestratorStep: {
      agentName: "Orchestrator",
      agentRole: "วิเคราะห์และประสานงาน",
      thinking: "วิเคราะห์คำถามและมอบหมายงาน",
      result: "มอบหมายให้ Research Agent ค้นหาข้อมูล",
    },
    researchStep: {
      agentName: "Research Agent",
      agentRole: "ค้นหาและวิเคราะห์ข้อมูล",
      thinking: "ค้นหาข้อมูลที่เกี่ยวข้อง",
      tool: { name: "knowledge_search", displayName: "ค้นหาความรู้สุขภาพ", input: "คำถามของผู้ใช้", output: message.slice(0, 120) },
      result: "พบข้อมูลที่เกี่ยวข้องแล้ว",
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
          send({ type: "error", message: buildConfigurationError() });
          controller.close();
          return;
        }

        // 1. Orchestrator starts immediately (before LLM call — gives instant feedback)
        send({ type: "agent_start", agentName: "Orchestrator", agentRole: "วิเคราะห์และประสานงาน" });

        // 2. Call LLM
        const historyText = formatHistory(body.history ?? []);
        const fullPrompt = [
          historyText ? `บริบทการสนทนาก่อนหน้า:\n${historyText}` : "",
          `คำถามล่าสุดของผู้ใช้: ${prompt}`,
        ]
          .filter(Boolean)
          .join("\n\n");

        const apiKey = process.env.OPENROUTER_API_KEY;
        const response = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": APP_URL,
            "X-Title": APP_TITLE,
          },
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.4,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: fullPrompt },
            ],
          }),
        });

        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          const errorMessage = (payload as { error?: { message?: string } })?.error?.message;
          throw new Error(errorMessage || "OpenRouter request failed");
        }

        const content = getMessageContent(payload).trim();
        if (!content) throw new Error("OpenRouter returned an empty response");

        const { message, orchestratorStep, researchStep, synthesizerStep } = parseMultiAgentResponse(content);

        // 3. Orchestrator done
        send({ type: "agent_done", step: { ...orchestratorStep, status: "done" } });
        await sleep(350);

        // 4. Research Agent starts
        send({ type: "agent_start", agentName: "Research Agent", agentRole: "ค้นหาและวิเคราะห์ข้อมูล" });
        await sleep(1100);

        // 5. Research Agent done
        send({ type: "agent_done", step: { ...researchStep, status: "done" } });
        await sleep(350);

        // 6. Synthesizer starts
        send({ type: "agent_start", agentName: "Synthesizer", agentRole: "สรุปและจัดรูปแบบคำตอบ" });
        await sleep(750);

        // 7. Synthesizer done
        send({ type: "agent_done", step: { ...synthesizerStep, status: "done" } });
        await sleep(200);

        // 8. Final answer
        send({
          type: "final",
          message,
          agentSteps: [
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
