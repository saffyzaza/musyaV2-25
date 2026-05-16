import { NextResponse } from "next/server";

import type { ChatRouteRequest, ChatRouteResponse } from "@/app/chat/chatTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const APP_TITLE = "Musya Chat";

function buildConfigurationError() {
  return [
    "ยังไม่ได้ตั้งค่า OpenRouter สำหรับแชต AI",
    "เพิ่ม OPENROUTER_API_KEY ในไฟล์ .env.local แล้ว restart dev server",
    "ตัวอย่างค่าที่ต้องมีดูได้จาก .env.example",
  ].join("\n");
}

function getMessageContent(data: unknown) {
  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

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

async function callOpenRouter(prompt: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(buildConfigurationError());
  }

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
        {
          role: "system",
          content:
            "คุณคือผู้ช่วย AI ภาษาไทยสำหรับงานความรู้สุขภาพและข้อมูลทั่วไป ตอบให้ชัดเจน กระชับ ใช้งานได้จริง และถ้าเป็นเรื่องวินิจฉัยโรคหรืออาการรุนแรงให้แนะนำพบแพทย์หรือผู้เชี่ยวชาญที่เหมาะสม",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    const errorMessage = (payload as { error?: { message?: string } })?.error?.message;
    throw new Error(errorMessage || "OpenRouter request failed");
  }

  const content = getMessageContent(payload).trim();

  if (!content) {
    throw new Error("OpenRouter returned an empty response");
  }

  return content;
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
    const message = await callOpenRouter(
      [
        historyText ? `บริบทการสนทนาก่อนหน้า:\n${historyText}` : "",
        `คำถามล่าสุดของผู้ใช้: ${prompt}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );

    const responseBody: ChatRouteResponse = { message };
    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Chat route error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}