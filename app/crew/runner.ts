import type { Crew, Task, TaskOutput, CrewOutput, Agent } from "@/app/agents/types";
import { DOMAIN_AGENTS } from "@/app/agents/domains";

export type PlannedAgent = { name: string; role: string };

export type CrewEvent =
  | { type: "crew_plan"; agents: PlannedAgent[] }
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

function parseDomainFromOutput(output: string): string | null {
  const match = output.match(/\[DOMAIN:\s*([^\]]+)\]/i);
  return match ? match[1].trim() : null;
}

function parseTaskOutput(task: Task, rawOutput: string): TaskOutput {
  const toolMatch = rawOutput.match(/\[TOOL:\s*([^\]]+)\]/i);
  const toolName = toolMatch ? toolMatch[1].trim() : undefined;
  const result = rawOutput.replace(/\[DOMAIN:[^\]]+\]/gi, "").replace(/\[TOOL:[^\]]+\]/gi, "").trim();

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

  // We'll resolve the domain agent after the Orchestrator task runs.
  // Start with a placeholder plan using the first task's agent names.
  let dynamicTasks: Task[] = [...crew.tasks];
  let planSent = false;

  for (let taskIndex = 0; taskIndex < dynamicTasks.length; taskIndex++) {
    const task = dynamicTasks[taskIndex];

    // Gather context
    const contextOutputs = (task.context ?? [])
      .map((dep) => {
        // Find the matching completed task by description (since tasks may be cloned)
        for (const [completedTask, output] of completedOutputs) {
          if (completedTask.description === dep.description) return output;
        }
        return undefined;
      })
      .filter(Boolean) as TaskOutput[];

    // After Orchestrator runs, determine domain agent and send crew_plan
    if (taskIndex === 1 && !planSent) {
      const orchestratorOutput = Array.from(completedOutputs.values())[0];
      const domainKey = orchestratorOutput ? parseDomainFromOutput(orchestratorOutput.rawOutput) : null;
      const domainAgent = domainKey ? DOMAIN_AGENTS[domainKey] : null;

      if (domainAgent) {
        // Swap task[1] agent to the matched domain agent
        dynamicTasks = dynamicTasks.map((t, i) =>
          i === 1 ? { ...t, agent: domainAgent } : t,
        );
      }

      // Send crew_plan so UI can show the actual pipeline
      const plannedAgents: PlannedAgent[] = dynamicTasks.map((t) => ({
        name: t.agent.name,
        role: t.agent.role,
      }));
      yield { type: "crew_plan", agents: plannedAgents };
      planSent = true;
    }

    // Re-fetch current task (might have been updated)
    const currentTask = dynamicTasks[taskIndex];

    yield { type: "task_start", agent: currentTask.agent, task: currentTask };

    const { system, user } = buildAgentPrompt(currentTask, contextOutputs, inputs);
    const rawOutput = await callLLM(system, user);
    const taskOutput = parseTaskOutput(currentTask, rawOutput);

    completedOutputs.set(currentTask, taskOutput);
    yield { type: "task_done", agent: currentTask.agent, task: currentTask, output: taskOutput };
  }

  const lastTask = dynamicTasks[dynamicTasks.length - 1];
  const lastOutput = completedOutputs.get(lastTask);

  yield {
    type: "crew_done",
    result: {
      finalAnswer: lastOutput?.result ?? "",
      taskOutputs: Array.from(completedOutputs.values()),
    },
  };
}
