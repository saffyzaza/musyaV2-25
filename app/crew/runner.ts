import type { Crew, Task, TaskOutput, CrewOutput, Agent } from "@/app/agents/types";

export type CrewEvent =
  | { type: "task_start"; agent: Agent; task: Task }
  | { type: "task_done"; agent: Agent; task: Task; output: TaskOutput }
  | { type: "crew_done"; result: CrewOutput };

type LLMCaller = (systemPrompt: string, userPrompt: string) => Promise<string>;

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildAgentPrompt(
  task: Task,
  contextOutputs: TaskOutput[],
  inputs: Record<string, string>,
): { system: string; user: string } {
  const { agent } = task;
  const query = inputs.query ?? "";

  const toolList =
    agent.tools.length > 0
      ? agent.tools.map((t) => `  - ${t.name}: ${t.description}`).join("\n")
      : "  ไม่มีเครื่องมือเฉพาะ ใช้ความรู้ของตัวเอง";

  const contextText =
    contextOutputs.length > 0
      ? contextOutputs
          .map((co) => `### ${co.task.agent.name} (${co.task.agent.role})\n${co.result}`)
          .join("\n\n")
      : "";

  const system = [
    `คุณคือ ${agent.role}`,
    "",
    `เป้าหมาย: ${agent.goal}`,
    "",
    `ประวัติย่อ:\n${agent.backstory}`,
    "",
    `เครื่องมือที่ใช้ได้:\n${toolList}`,
  ].join("\n");

  const user = [
    `งานของคุณ:\n${task.description.replace(/\{query\}/g, query)}`,
    "",
    `ผลลัพธ์ที่ต้องการ:\n${task.expectedOutput}`,
    contextText ? `\nบริบทจาก agents ก่อนหน้า:\n${contextText}` : "",
    "",
    `คำถามของผู้ใช้: ${query}`,
    "",
    "ตอบเฉพาะผลลัพธ์ของงาน ไม่ต้องอธิบายว่าจะทำอะไร",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

// ─── Output parser ────────────────────────────────────────────────────────────

function parseTaskOutput(task: Task, rawOutput: string): TaskOutput {
  // Extract tool reference [TOOL: name] if present
  const toolMatch = rawOutput.match(/\[TOOL:\s*([^\]]+)\]/i);
  const toolName = toolMatch ? toolMatch[1].trim() : undefined;
  const result = rawOutput.replace(/\[TOOL:[^\]]+\]/gi, "").trim();

  // Split off a short "thinking" preamble if the agent wrote one
  // Pattern: first paragraph before actual content
  const lines = result.split("\n");
  const thinkingEnd = lines.findIndex(
    (l, i) => i > 0 && (l.startsWith("#") || l.startsWith("-") || l.startsWith("|")),
  );
  const thinking =
    thinkingEnd > 1 ? lines.slice(0, thinkingEnd).join(" ").trim() : task.description.split("\n")[0];
  const cleanResult = thinkingEnd > 1 ? lines.slice(thinkingEnd).join("\n").trim() : result;

  return {
    task,
    rawOutput,
    thinking,
    result: cleanResult || result,
    toolName,
    toolInput: toolName ? `จาก task: ${task.description.split("\n")[0]}` : undefined,
    toolOutput: toolName ? cleanResult.slice(0, 200) : undefined,
  };
}

// ─── Crew runner ──────────────────────────────────────────────────────────────

export async function* runCrew(
  crew: Crew,
  inputs: Record<string, string>,
  callLLM: LLMCaller,
): AsyncGenerator<CrewEvent> {
  const completedOutputs = new Map<Task, TaskOutput>();

  for (const task of crew.tasks) {
    // Gather context from tasks this one depends on
    const contextOutputs = (task.context ?? [])
      .map((dep) => completedOutputs.get(dep))
      .filter(Boolean) as TaskOutput[];

    yield { type: "task_start", agent: task.agent, task };

    const { system, user } = buildAgentPrompt(task, contextOutputs, inputs);
    const rawOutput = await callLLM(system, user);
    const taskOutput = parseTaskOutput(task, rawOutput);

    completedOutputs.set(task, taskOutput);

    yield { type: "task_done", agent: task.agent, task, output: taskOutput };
  }

  // Final answer = last task's result
  const lastTask = crew.tasks[crew.tasks.length - 1];
  const lastOutput = completedOutputs.get(lastTask);

  yield {
    type: "crew_done",
    result: {
      finalAnswer: lastOutput?.result ?? "",
      taskOutputs: Array.from(completedOutputs.values()),
    },
  };
}
