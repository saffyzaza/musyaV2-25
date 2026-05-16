import type { ChatRouteRequest, AgentStep } from "@/app/chat/chatTypes";
import healthCrew from "@/app/crew/healthCrew";
import { runCrew, type ModelConfig } from "@/app/crew/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const APP_TITLE = "Musya Chat";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

const MODELS: ModelConfig = {
  orchestrator: process.env.OPENROUTER_MODEL_ORCHESTRATOR ?? DEFAULT_MODEL,
  domain:       process.env.OPENROUTER_MODEL_DOMAIN       ?? DEFAULT_MODEL,
  synthesizer:  process.env.OPENROUTER_MODEL_SYNTHESIZER  ?? DEFAULT_MODEL,
  tool:         process.env.OPENROUTER_MODEL_TOOL         ?? DEFAULT_MODEL,
};

// ─── LLM caller ───────────────────────────────────────────────────────────────

async function callLLM(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY!;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": APP_URL,
      "X-Title": APP_TITLE,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) throw new Error(payload.error?.message || "OpenRouter error");

  const content = payload.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("LLM returned empty response");
  return content.trim();
}

function formatHistory(history: ChatRouteRequest["history"]) {
  return history
    .slice(-6)
    .map((m) => `${m.role.toUpperCase()}: ${m.text}`)
    .join("\n");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

        const historyText = formatHistory(body.history ?? []);
        const query = historyText
          ? `บริบทก่อนหน้า:\n${historyText}\n\nคำถามล่าสุด: ${prompt}`
          : prompt;

        const collectedSteps: AgentStep[] = [];

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        for await (const event of runCrew(healthCrew, { query }, callLLM, appUrl, MODELS)) {
          if (event.type === "crew_plan") {
            send({ type: "crew_plan", agents: event.agents });
          } else if (event.type === "task_start") {
            send({
              type: "agent_start",
              agentName: event.agent.name,
              agentRole: event.agent.role,
            });
          } else if (event.type === "task_done") {
            const { agent, output } = event;

            const step: AgentStep = {
              agentName: agent.name,
              agentRole: agent.role,
              thinking: output.thinking,
              tool: output.toolName
                ? {
                    name: output.toolName,
                    displayName:
                      agent.tools.find((t) => t.name === output.toolName)?.description ??
                      output.toolName,
                    input: output.toolInput ?? "",
                    output: output.toolOutput ?? "",
                  }
                : null,
              result: output.result.slice(0, 200),
              status: "done",
            };

            collectedSteps.push(step);
            send({ type: "agent_done", step });
            await sleep(300);
          } else if (event.type === "crew_done") {
            send({
              type: "final",
              message: event.result.finalAnswer,
              agentSteps: collectedSteps,
            });
          }
        }
      } catch (error) {
        console.error("Crew SSE error:", error);
        send({ type: "error", message: error instanceof Error ? error.message : "Unknown error" });
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
