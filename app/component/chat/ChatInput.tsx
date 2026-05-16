"use client"
import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IoSend } from "react-icons/io5";
import { HiOutlineLightBulb, HiOutlineSparkles } from "react-icons/hi";
import { FiPlus, FiList, FiPaperclip, FiImage, FiCamera, FiFileText, FiEdit, FiDatabase } from "react-icons/fi";
import { TbGitCompare } from "react-icons/tb";

import type { ChatRouteResponse } from "../../chat/chatTypes";
import {
    createChatSessionMessage,
    generateChatSessionId,
    getChatSessionState,
    saveChatSessionState,
} from "../../chat/chatSessionStore";

type ChatInputProps = {
    onToggleDatabaseExplorer?: () => void;
};

export const ChatInput = ({ onToggleDatabaseExplorer }: ChatInputProps) => {
    const router = useRouter();
    const pathname = usePathname();
    const [message, setMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowAddMenu(false);
                setShowToolsMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSend = async () => {
        const trimmedMessage = message.trim();

        if (!trimmedMessage || isSubmitting) {
            return;
        }

        const currentSessionId = pathname.match(/^\/chat\/sessions\/([^/]+)$/)?.[1];
        const sessionId = currentSessionId ?? generateChatSessionId();
        const currentState = getChatSessionState(sessionId);
        const nextMessages = [
            ...currentState.messages,
            createChatSessionMessage("user", trimmedMessage),
        ];

        saveChatSessionState(sessionId, {
            ...currentState,
            sessionId,
            status: "running",
            error: undefined,
            lastUserPrompt: trimmedMessage,
            messages: nextMessages,
        });

        setMessage("");
        setShowAddMenu(false);
        setShowToolsMenu(false);

        if (!currentSessionId) {
            router.push(`/chat/sessions/${sessionId}`);
        }

        setIsSubmitting(true);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    sessionId,
                    prompt: trimmedMessage,
                    history: nextMessages,
                }),
            });

            const payload = (await response.json()) as ChatRouteResponse | { error?: string };

            if (!response.ok || !("message" in payload)) {
                const errorMessage = "error" in payload ? payload.error : undefined;
                throw new Error(errorMessage || "ไม่สามารถติดต่อ AI ได้");
            }

            saveChatSessionState(sessionId, {
                ...getChatSessionState(sessionId),
                sessionId,
                status: "completed",
                error: undefined,
                messages: [
                    ...getChatSessionState(sessionId).messages,
                    createChatSessionMessage("ai", payload.message, payload.agentSteps),
                ],
                lastUserPrompt: trimmedMessage,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "ไม่สามารถติดต่อ AI ได้";

            saveChatSessionState(sessionId, {
                ...getChatSessionState(sessionId),
                sessionId,
                status: "failed",
                error: errorMessage,
                messages: [
                    ...getChatSessionState(sessionId).messages,
                    createChatSessionMessage("ai", `ระบบ AI ตอบกลับไม่สำเร็จ: ${errorMessage}`),
                ],
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div ref={wrapperRef} className="w-full max-w-2xl mx-auto bg-white border border-gray-100 p-2.5 rounded-2xl shadow-sm relative">
            {/* Popover เพิ่ม */}
            {showAddMenu && (
                <div className="absolute bottom-18 left-2 bg-white rounded-xl shadow-lg border border-gray-100 p-2 w-56 flex flex-col gap-1 z-10 transition-all">
                    <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-[#334155] hover:bg-gray-50 rounded-lg transition-colors text-left">
                        <FiPaperclip size={18} className="text-[#64748b]" />
                        <span>เพิ่มไฟล์</span>
                    </button>
                    <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-[#334155] hover:bg-gray-50 rounded-lg transition-colors text-left">
                        <FiImage size={18} className="text-[#64748b]" />
                        <span>เพิ่มรูปภาพ</span>
                    </button>
                    <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-[#334155] hover:bg-gray-50 rounded-lg transition-colors text-left">
                        <FiCamera size={18} className="text-[#64748b]" />
                        <span>ถ่ายรูป</span>
                    </button>
                    <div className="h-px bg-gray-100 my-1"></div>
                    <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-[#334155] bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left font-medium">
                        <HiOutlineSparkles size={18} className="text-[#64748b]" />
                        <span>ใช้เครื่องมือ AI</span>
                    </button>
                </div>
            )}

            {/* Popover เครื่องมือ */}
            {showToolsMenu && (
                <div className="absolute bottom-18 left-24 bg-white rounded-xl shadow-lg border border-gray-100 p-2 w-64 flex flex-col gap-1 z-10 transition-all">
                    <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-[#334155] hover:bg-gray-50 rounded-lg transition-colors text-left">
                        <TbGitCompare size={18} className="text-[#64748b]" />
                        <span>เปรียบเทียบข้อมูล</span>
                    </button>
                    <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-[#334155] hover:bg-gray-50 rounded-lg transition-colors text-left">
                        <FiFileText size={18} className="text-[#64748b]" />
                        <span>สรุปรายงาน</span>
                    </button>
                    <div className="flex flex-col w-full text-left">
                        <button className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-[#334155] hover:bg-gray-50 rounded-lg transition-colors">
                            <FiEdit size={18} className="text-[#64748b]" />
                            <span>เขียนแผนงาน</span>
                        </button>
                        <div className="pl-10 pb-2 pr-3 flex flex-col gap-2 relative">
                            <div className="absolute left-5.25 top-0 bottom-2 w-px bg-gray-200"></div>
                            <div className="text-xs text-[#64748b] bg-white relative z-10">A = บทความต้นฉบับ</div>
                            <div className="text-xs text-[#64748b] bg-white relative z-10 leading-relaxed">B = แนวทางการเฝ้าระวัง<br/>สอบสวน ควบคุมโรค</div>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            onToggleDatabaseExplorer?.();
                            setShowToolsMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-[#334155] hover:bg-gray-50 rounded-lg transition-colors text-left"
                    >
                        <FiDatabase size={18} className="text-[#64748b]" />
                        <span>ฐานข้อมูล</span>
                    </button>
                </div>
            )}

            <div className="flex items-center w-full bg-[#f8f9fb] border border-gray-200 rounded-xl px-3 py-1.5 transition-all focus-within:border-gray-300 focus-within:bg-white text-sm">
                <HiOutlineLightBulb size={18} className="text-[#db5b24] mr-2.5" />
                <input 
                    type="text" 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            void handleSend();
                        }
                    }}
                    placeholder="พิมพ์ข้อความของคุณ..." 
                    className="flex-1 outline-none bg-transparent text-gray-700 placeholder-gray-400 py-1"
                />
                <button 
                    onClick={() => {
                        void handleSend();
                    }}
                    disabled={!message.trim() || isSubmitting}
                    className="bg-[#949eb0] hover:bg-[#7b8599] text-white rounded-lg p-1.5 ml-2 disabled:opacity-50 transition-colors flex items-center justify-center transform hover:scale-105 active:scale-95"
                    title="Send message"
                >
                    <IoSend size={16} className="translate-x-0.5 -translate-y-0.5" />
                </button>
            </div>
            
            <div className="flex items-center gap-2 mt-2.5 px-1 relative">
                <button 
                    onClick={() => {
                        setShowAddMenu(!showAddMenu);
                        setShowToolsMenu(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${showAddMenu ? 'bg-[#e9ebf0] text-[#334155]' : 'bg-[#f4f5f8] hover:bg-[#e9ebf0] text-[#334155]'}`}
                >
                    <FiPlus className="text-[#db5b24]" size={14} /> 
                    <span>เพิ่ม</span>
                </button>
                <button 
                    onClick={() => {
                        setShowToolsMenu(!showToolsMenu);
                        setShowAddMenu(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${showToolsMenu ? 'bg-[#e9ebf0] text-[#334155]' : 'bg-[#f4f5f8] hover:bg-[#e9ebf0] text-[#334155]'}`}
                >
                    <FiList className="text-[#db5b24]" size={14} /> 
                    <span>เครื่องมือ</span>
                </button>
            </div>
        </div>
    );
};
