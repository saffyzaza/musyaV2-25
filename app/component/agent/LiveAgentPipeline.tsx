"use client";
import type { AgentStep } from "@/app/chat/chatTypes";
import { PIPELINE_AGENTS } from "./agentConfig";
import { LiveStepCard } from "./LiveStepCard";

type Props = { streamingSteps: AgentStep[] };

export function LiveAgentPipeline({ streamingSteps }: Props) {
  const doneCount = streamingSteps.filter((s) => s.status === "done").length;

  return (
    <div className="mb-2.5 rounded-xl border border-amber-100 bg-white overflow-hidden shadow-sm w-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
        <div className="flex gap-0.5">
          {[0, 120, 240].map((d) => (
            <div
              key={d}
              className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
              style={{ animationDelay: `${d}ms` }}
            />
          ))}
        </div>
        <span className="text-xs font-semibold text-amber-700">Agent Pipeline กำลังทำงาน...</span>
        <span className="ml-auto text-[10px] text-amber-500">
          {doneCount} / {PIPELINE_AGENTS.length}
        </span>
      </div>

      <div className="px-3 pt-2.5 pb-2">
        {PIPELINE_AGENTS.map((agentDef, i) => {
          const step = streamingSteps.find((s) => s.agentName === agentDef.name);
          return (
            <LiveStepCard
              key={agentDef.name}
              agentName={agentDef.name}
              agentRole={agentDef.role}
              step={step}
              isLast={i === PIPELINE_AGENTS.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}
