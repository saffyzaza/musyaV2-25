import { NextResponse } from "next/server";

import type { ChatRouteRequest, ChatRouteResponse, AgentStep } from "@/app/chat/chatTypes";

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
    "ตัวอย่างค่าที่ต้องมีดูได้จาก .env.example",
  ].join("\n");
}

function getMessageContent(data: unknown): string {
  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("\n");
  }

  return "";
}

function formatHistory(history: ChatRouteRequest["history"]) {
  return history
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.text}`)
    .join("\n");
}

function parseMultiAgentResponse(content: string): { message: string; agentSteps?: AgentStep[] } {
  try {
    const jsonMatch =
      content.match(/```json\s*([\s\S]*?)\s*```/) ||
      content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    const parsed = JSON.parse(jsonStr.trim()) as Record<string, string>;

    if (!parsed.finalAnswer) return { message: content };

    const agentSteps: AgentStep[] = [
      {
        agentName: "Orchestrator",
        agentRole: "วิเคราะห์และประสานงาน",
        thinking: parsed.orchestrator_thinking || "",
        tool: null,
        result: parsed.orchestrator_delegation || "",
      },
      {
        agentName: "Research Agent",
        agentRole: "ค้นหาและวิเคราะห์ข้อมูล",
        thinking: parsed.researcher_thinking || "",
        tool: parsed.researcher_tool
          ? {
              name: parsed.researcher_tool,
              displayName: TOOL_DISPLAY_NAMES[parsed.researcher_tool] || parsed.researcher_tool,
              input: parsed.researcher_tool_input || "",
              output: parsed.researcher_findings || "",
            }
          : null,
        result: parsed.researcher_findings || "",
      },
      {
        agentName: "Synthesizer",
        agentRole: "สรุปและจัดรูปแบบคำตอบ",
        thinking: parsed.synthesizer_thinking || "",
        tool: null,
        result: parsed.synthesizer_summary || "",
      },
    ];

    return { message: parsed.finalAnswer, agentSteps };
  } catch {
    return { message: content };
  }
}

async function callOpenRouter(prompt: string): Promise<{ message: string; agentSteps?: AgentStep[] }> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) throw new Error(buildConfigurationError());

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
        { role: "user", content: prompt },
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

  return parseMultiAgentResponse(content);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRouteRequest;
    const prompt = body.prompt?.trim();

    if (!body.sessionId || !prompt) {
      return NextResponse.json({ error: "sessionId and prompt are required" }, { status: 400 });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({ error: buildConfigurationError() }, { status: 503 });
    }

    const historyText = formatHistory(body.history ?? []);
    const fullPrompt = [
      historyText ? `บริบทการสนทนาก่อนหน้า:\n${historyText}` : "",
      `คำถามล่าสุดของผู้ใช้: ${prompt}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { message, agentSteps } = await callOpenRouter(fullPrompt);

    const responseBody: ChatRouteResponse = { message, agentSteps };
    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Chat route error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
