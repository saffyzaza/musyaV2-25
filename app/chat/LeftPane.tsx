"use client";
import { useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import clsx from "clsx";

import type { ChatSessionState } from "./chatTypes";
import { createEmptyChatSessionState, getChatSessionState, subscribeToChatSession } from "./chatSessionStore";

const PREVIEW_SESSION: ChatSessionState = createEmptyChatSessionState("preview-session");

export const LeftPane = () => {
    const params = useParams<{ sessionId?: string }>();
    const sessionId = typeof params?.sessionId === "string" ? params.sessionId : null;
    const session = useSyncExternalStore(
        (onStoreChange) => subscribeToChatSession(sessionId, onStoreChange),
        () => {
            if (!sessionId) {
                return PREVIEW_SESSION;
            }

            return getChatSessionState(sessionId);
        },
        () => PREVIEW_SESSION,
    );

    return (
        <div className="flex-1 h-full border-r border-gray-200 p-4 bg-white shrink-0 shadow-sm overflow-y-auto rounded-lg flex flex-col">
            <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-800">Left Content</h2>
                {sessionId ? (
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                        <span>Session: {sessionId}</span>
                        <span
                            className={clsx(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                session.status === "completed" && "bg-emerald-50 text-emerald-600",
                                session.status === "running" && "bg-amber-50 text-amber-600",
                                session.status === "failed" && "bg-rose-50 text-rose-600",
                                session.status === "idle" && "bg-slate-100 text-slate-500",
                            )}
                        >
                            {session.status}
                        </span>
                    </div>
                ) : null}
            </div>
            
            <div className="flex flex-col space-y-4">
                {session.messages.length ? session.messages.map((msg) => (
                    msg.role === "user" ? (
                        <div key={msg.id} className="flex flex-col items-end">
                            <div className="bg-[#eb6f45f1] text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm shadow-sm leading-relaxed whitespace-pre-wrap">
                                {msg.text}
                            </div>
                            <span className="text-xs text-gray-400 mt-1 mr-1">{msg.timestamp}</span>
                        </div>
                    ) : (
                        <div key={msg.id} className="flex flex-col items-start">
                            <div className="bg-gray-50 border border-gray-200 text-gray-800 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] text-sm shadow-sm leading-relaxed whitespace-pre-wrap">
                                {msg.text}
                            </div>
                            <span className="text-xs text-gray-400 mt-1 ml-1">{msg.timestamp}</span>
                        </div>
                    )
                )) : (
                    <div className="rounded-2xl border border-dashed border-[#f0dfd8] bg-[#fcfbf9] p-5 text-sm leading-relaxed text-gray-500">
                        {sessionId
                            ? "เริ่มพิมพ์คำถามด้านล่างเพื่อเริ่มสนทนาใน session นี้"
                            : "สร้าง session ใหม่โดยพิมพ์ข้อความในช่องแชตด้านล่าง"}
                    </div>
                )}
            </div>

            {session.error ? (
                <div className="mt-6 rounded-2xl bg-[#fff4f2] p-3 text-sm text-[#a04222] ring-1 ring-[#f0dfd8]">
                    {session.error}
                </div>
            ) : null}
        </div>
    );
};