"use client";
import { useSyncExternalStore, useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import clsx from "clsx";
import { HiOutlineSparkles, HiOutlineLightBulb } from "react-icons/hi";
import { FiSearch, FiCpu, FiTool, FiChevronDown, FiChevronRight, FiDatabase, FiCode } from "react-icons/fi";

import type { ChatSessionState, AgentStep } from "./chatTypes";
import { createEmptyChatSessionState, getChatSessionState, subscribeToChatSession } from "./chatSessionStore";
import { getStreamingSteps, subscribeToStreamingState } from "./streamingStore";
import { MarkdownContent } from "../component/chat/MarkdownContent";

const PREVIEW_SESSION: ChatSessionState = createEmptyChatSessionState("preview-session");

// Pipeline agent definitions — fixed order, always shown
const PIPELINE_AGENTS = [
  { name: "CSV Finder", role: "ค้นหาและโหลดไฟล์ข้อมูล" },
  { name: "Orchestrator", role: "วิเคราะห์และประสานงาน" },
  { name: "Code Agent", role: "เขียนและรัน Python Code" },
  { name: "Research Agent", role: "ค้นหาและวิเคราะห์ข้อมูล" },
  { name: "Synthesizer", role: "สรุปและจัดรูปแบบคำตอบ" },
] as const;

type AgentCfg = { color: string; bg: string; border: string; dot: string; letter: string };

const AGENT_CONFIG: Record<string, AgentCfg> = {
  "CSV Finder":   { color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200",  dot: "bg-orange-500",  letter: "F" },
  Orchestrator:   { color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200",  dot: "bg-violet-500",  letter: "O" },
  "Code Agent":   { color: "text-green-700",   bg: "bg-green-50",   border: "border-green-200",   dot: "bg-green-600",   letter: "C" },
  "Research Agent": { color: "text-blue-700",  bg: "bg-blue-50",    border: "border-blue-200",    dot: "bg-blue-500",    letter: "R" },
  Synthesizer:    { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", letter: "S" },
};

const DEFAULT_CFG: AgentCfg = { color: "text-gray-700", bg: "bg-gray-50", border: "border-gray-200", dot: "bg-gray-400", letter: "?" };

const TOOL_ICONS: Record<string, string> = {
  knowledge_search: "🔍",
  data_analysis: "📊",
  clinical_guidelines: "📋",
  statistics_tool: "📈",
  nutrition_database: "🥗",
  disease_surveillance: "🦠",
  list_files: "📁",
  read_csv: "📋",
  analyze_and_fetch: "🧠",
  code_execution: "🐍",
};

function AgentIcon({ name }: { name: string }) {
  if (name === "CSV Finder") return <FiDatabase size={9} />;
  if (name === "Orchestrator") return <HiOutlineLightBulb size={10} />;
  if (name === "Code Agent") return <FiCode size={9} />;
  if (name === "Research Agent") return <FiSearch size={9} />;
  if (name === "Synthesizer") return <HiOutlineSparkles size={10} />;
  return <FiCpu size={9} />;
}

function ToolCard({ step, cfg }: { step: AgentStep; cfg: AgentCfg }) {
  if (!step.tool) return null;
  const hasCodeBlock = (s: string) => s.includes("```");
  return (
    <div className={clsx("rounded-lg p-2 border", cfg.bg, cfg.border)}>
      <div className={clsx("text-[10px] font-semibold mb-1.5 flex items-center gap-1.5", cfg.color)}>
        <FiTool size={9} />
        <span>{TOOL_ICONS[step.tool.name] ?? "🔧"} {step.tool.displayName}</span>
      </div>
      <div className="space-y-1.5">
        <div>
          <span className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">Input</span>
          <div className="mt-0.5 bg-white/80 rounded overflow-hidden">
            {hasCodeBlock(step.tool.input) ? (
              <MarkdownContent text={step.tool.input} />
            ) : (
              <p className="text-[11px] text-gray-600 px-1.5 py-0.5 leading-relaxed">{step.tool.input}</p>
            )}
          </div>
        </div>
        <div>
          <span className="text-[9px] uppercase tracking-wide text-gray-400 font-medium">Output</span>
          <div className="mt-0.5 bg-white/80 rounded overflow-hidden">
            {hasCodeBlock(step.tool.output) ? (
              <MarkdownContent text={step.tool.output} />
            ) : (
              <p className="text-[11px] text-gray-600 px-1.5 py-0.5 leading-relaxed">{step.tool.output}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Live step card (during streaming) ───────────────────────────────────────
function LiveStepCard({
  agentName, agentRole, step, isLast,
}: {
  agentName: string;
  agentRole: string;
  step?: AgentStep;
  isLast: boolean;
}) {
  const status = step?.status ?? "pending";
  const cfg = AGENT_CONFIG[agentName] ?? DEFAULT_CFG;
  const [open, setOpen] = useState(false);

  // Auto-expand when this agent just finished
  useEffect(() => {
    if (status === "done") setOpen(true);
  }, [status]);

  return (
    <div className="relative">
      {!isLast && (
        <div className={clsx(
          "absolute left-[9px] top-6 bottom-0 w-px z-0",
          status === "pending" ? "bg-gray-100" : "bg-gray-200",
        )} />
      )}

      <div className="relative z-10 flex gap-2.5">
        {/* Status dot */}
        {status === "pending" && (
          <div className="w-[19px] h-[19px] rounded-full border-2 border-gray-200 bg-white shrink-0 mt-0.5" />
        )}
        {status === "running" && (
          <div className={clsx(
            "w-[19px] h-[19px] rounded-full flex items-center justify-center shrink-0 mt-0.5 border-2 border-white shadow-sm text-white animate-pulse",
            cfg.dot,
          )}>
            <AgentIcon name={agentName} />
          </div>
        )}
        {status === "done" && (
          <div className={clsx(
            "w-[19px] h-[19px] rounded-full flex items-center justify-center shrink-0 mt-0.5 border-2 border-white shadow-sm text-white",
            cfg.dot,
          )}>
            <AgentIcon name={agentName} />
          </div>
        )}

        <div className="flex-1 min-w-0 pb-1">
          {/* Row header */}
          <button
            onClick={() => status === "done" && setOpen((v) => !v)}
            disabled={status !== "done"}
            className={clsx(
              "flex items-center gap-2 w-full text-left py-0.5",
              status === "done" ? "cursor-pointer group" : "cursor-default",
            )}
          >
            <span className={clsx(
              "text-xs font-semibold leading-none",
              status === "pending" ? "text-gray-300" : cfg.color,
            )}>
              {agentName}
            </span>
            <span className={clsx(
              "text-[10px] leading-none",
              status === "pending" ? "text-gray-200" : "text-gray-400",
            )}>
              {agentRole}
            </span>

            {status === "running" && (
              <span className="ml-auto flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-amber-500 font-medium">กำลังทำงาน</span>
                <div className="flex gap-0.5">
                  {[0, 100, 200].map((d) => (
                    <div key={d} className="w-1 h-1 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </span>
            )}
            {status === "done" && (
              <span className="ml-auto flex items-center gap-1 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0">
                <span className="text-[10px] text-emerald-500 font-bold">✓</span>
                {open ? <FiChevronDown size={11} /> : <FiChevronRight size={11} />}
              </span>
            )}
          </button>

          {/* Collapsed preview */}
          {status === "done" && !open && step?.result && (
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{step.result}</p>
          )}

          {/* Running progress bar */}
          {status === "running" && (
            <div className="mt-1.5 h-1 bg-amber-100 rounded-full overflow-hidden">
              <div className="h-full w-3/5 bg-amber-300 rounded-full animate-pulse" />
            </div>
          )}

          {/* Expanded detail */}
          {status === "done" && open && step && (
            <div className="mt-1.5 space-y-1.5">
              {step.thinking && (
                <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                  <div className="text-[10px] font-medium text-gray-400 mb-1 flex items-center gap-1">
                    <span>💭</span><span>ความคิด</span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{step.thinking}</p>
                </div>
              )}
              <ToolCard step={step} cfg={cfg} />
              {step.result && (
                <div className="flex items-start gap-1.5">
                  <span className="text-emerald-500 text-xs shrink-0 mt-0.5 font-bold">✓</span>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{step.result}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isLast && <div className="h-2.5" />}
    </div>
  );
}

// ─── Completed step card (in final message) ──────────────────────────────────
function DoneStepCard({ step, isLast }: { step: AgentStep; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const cfg = AGENT_CONFIG[step.agentName] ?? DEFAULT_CFG;

  return (
    <div className="relative">
      {!isLast && <div className="absolute left-[9px] top-6 bottom-0 w-px bg-gray-200 z-0" />}

      <div className="relative z-10 flex gap-2.5">
        <div className={clsx(
          "w-[19px] h-[19px] rounded-full flex items-center justify-center shrink-0 mt-0.5 border-2 border-white shadow-sm text-white",
          cfg.dot,
        )}>
          <AgentIcon name={step.agentName} />
        </div>

        <div className="flex-1 min-w-0 pb-1">
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 w-full text-left group py-0.5">
            <span className={clsx("text-xs font-semibold leading-none", cfg.color)}>{step.agentName}</span>
            <span className="text-[10px] text-gray-400 leading-none">{step.agentRole}</span>
            <span className="ml-auto text-gray-300 group-hover:text-gray-500 transition-colors shrink-0">
              {open ? <FiChevronDown size={11} /> : <FiChevronRight size={11} />}
            </span>
          </button>

          {!open && step.result && (
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{step.result}</p>
          )}

          {open && (
            <div className="mt-1.5 space-y-1.5">
              {step.thinking && (
                <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                  <div className="text-[10px] font-medium text-gray-400 mb-1 flex items-center gap-1">
                    <span>💭</span><span>ความคิด</span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{step.thinking}</p>
                </div>
              )}
              <ToolCard step={step} cfg={cfg} />
              {step.result && (
                <div className="flex items-start gap-1.5">
                  <span className="text-emerald-500 text-xs shrink-0 mt-0.5 font-bold">✓</span>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{step.result}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isLast && <div className="h-2.5" />}
    </div>
  );
}

// ─── Live pipeline (while running) ───────────────────────────────────────────
function LiveAgentPipeline({ streamingSteps }: { streamingSteps: AgentStep[] }) {
  return (
    <div className="mb-2.5 rounded-xl border border-amber-100 bg-white overflow-hidden shadow-sm w-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/60 border-b border-amber-100">
        <div className="flex gap-0.5">
          {[0, 120, 240].map((d) => (
            <div key={d} className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
        <span className="text-xs font-semibold text-amber-700">Agent Pipeline กำลังทำงาน...</span>
        <span className="ml-auto text-[10px] text-amber-500">
          {streamingSteps.filter((s) => s.status === "done").length} / {PIPELINE_AGENTS.length}
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

// ─── Completed pipeline (in final AI message) ────────────────────────────────
function DoneAgentPipeline({ steps, messageId }: { steps: AgentStep[]; messageId: string }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-2.5 rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm w-full">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50/80 hover:bg-gray-100/60 transition-colors"
      >
        <div className="flex -space-x-1 shrink-0">
          {steps.slice(0, 3).map((step, i) => {
            const cfg = AGENT_CONFIG[step.agentName] ?? DEFAULT_CFG;
            return (
              <div key={i} className={clsx("w-4 h-4 rounded-full border-2 border-white flex items-center justify-center text-white text-[7px] font-bold shadow-sm", cfg.dot)}>
                {cfg.letter}
              </div>
            );
          })}
        </div>
        <span className="text-xs font-semibold text-gray-600">Agent Pipeline</span>
        <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">
          {steps.length} agents · เสร็จแล้ว
        </span>
        <span className="ml-auto text-gray-400 shrink-0">
          {expanded ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pt-2.5 pb-2">
          {steps.map((step, i) => (
            <DoneStepCard key={`${messageId}-${i}`} step={step} isLast={i === steps.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main LeftPane ────────────────────────────────────────────────────────────
export const LeftPane = () => {
  const params = useParams<{ sessionId?: string }>();
  const sessionId = typeof params?.sessionId === "string" ? params.sessionId : null;

  const session = useSyncExternalStore(
    (onChange) => subscribeToChatSession(sessionId, onChange),
    () => (sessionId ? getChatSessionState(sessionId) : PREVIEW_SESSION),
    () => PREVIEW_SESSION,
  );

  const streamingSteps = useSyncExternalStore(
    (onChange) => subscribeToStreamingState(sessionId, onChange),
    () => (sessionId ? getStreamingSteps(sessionId) : null),
    () => null,
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.messages.length, streamingSteps?.length]);

  return (
    <div className="flex-1 h-full border-r border-gray-200 bg-white shrink-0 shadow-sm rounded-lg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3.5 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <h2 className="text-sm font-semibold text-gray-700">Multi-Agent Chat</h2>
          {sessionId && (
            <span className={clsx(
              "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              session.status === "completed" && "bg-emerald-50 text-emerald-600",
              session.status === "running" && "bg-amber-50 text-amber-600",
              session.status === "failed" && "bg-rose-50 text-rose-600",
              session.status === "idle" && "bg-slate-100 text-slate-500",
            )}>
              {session.status}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {session.messages.length === 0 && !streamingSteps ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center py-8">
              <div className="flex justify-center gap-2 mb-3">
                {(["O", "R", "S"] as const).map((letter, i) => (
                  <div key={letter} className={clsx(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold",
                    i === 0 && "bg-violet-100 text-violet-600",
                    i === 1 && "bg-blue-100 text-blue-600",
                    i === 2 && "bg-emerald-100 text-emerald-600",
                  )}>
                    {letter}
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500">
                {sessionId ? "เริ่มพิมพ์คำถามด้านล่างเพื่อเริ่มสนทนา" : "สร้าง session ใหม่โดยพิมพ์ข้อความในช่องแชตด้านล่าง"}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">Orchestrator · Research Agent · Synthesizer</p>
            </div>
          </div>
        ) : (
          <>
            {session.messages.map((msg) =>
              msg.role === "user" ? (
                <div key={msg.id} className="flex flex-col items-end">
                  <div className="bg-[#eb6f45f1] text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm shadow-sm leading-relaxed">
                    {msg.text}
                  </div>
                  <span className="text-xs text-gray-400 mt-1 mr-1">{msg.timestamp}</span>
                </div>
              ) : (
                <div key={msg.id} className="flex flex-col items-start w-full">
                  {msg.agentSteps && msg.agentSteps.length > 0 && (
                    <div className="w-full max-w-[95%]">
                      <DoneAgentPipeline steps={msg.agentSteps} messageId={msg.id} />
                    </div>
                  )}
                  <div className="bg-gray-50 border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[95%] shadow-sm">
                    {msg.agentSteps && msg.agentSteps.length > 0 && (
                      <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-gray-100">
                        <HiOutlineSparkles size={11} className="text-emerald-500" />
                        <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Final Answer</span>
                      </div>
                    )}
                    <MarkdownContent text={msg.text} />
                  </div>
                  <span className="text-xs text-gray-400 mt-1 ml-1">{msg.timestamp}</span>
                </div>
              ),
            )}

            {/* Live pipeline (shown while running) */}
            {session.status === "running" && streamingSteps !== null && (
              <div className="flex flex-col items-start w-full">
                <div className="w-full max-w-[95%]">
                  <LiveAgentPipeline streamingSteps={streamingSteps} />
                </div>
              </div>
            )}
          </>
        )}

        {session.error && (
          <div className="rounded-2xl bg-[#fff4f2] p-3 text-sm text-[#a04222] ring-1 ring-[#f0dfd8]">
            {session.error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
