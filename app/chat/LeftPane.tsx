"use client";
import { useState } from "react";
import { IoTrainOutline, IoChevronForward } from "react-icons/io5";
import clsx from "clsx";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  timestamp: string;
}

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "user",
    text: "สวัสดีจ้า ช่วยสรุปข้อมูลให้หน่อย",
    timestamp: "10:41 AM",
  },
  {
    id: "2",
    role: "ai",
    text: "ได้เลยครับ! วันนี้มีอะไรให้ผมช่วยสรุปหรือค้นหาข้อมูลแจ้งมาได้เลยครับ ผมพร้อมเสมอ 😊",
    timestamp: "10:42 AM",
  },
];

export const LeftPane = () => {
    const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);

    return (
        <div className="flex-1 h-full border-r border-gray-200 p-4 bg-white shrink-0 shadow-sm overflow-y-auto rounded-lg flex flex-col">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Left Content</h2>
            
            <div className="flex flex-col space-y-4">
                {MOCK_MESSAGES.map((msg) => (
                    msg.role === "user" ? (
                        <div key={msg.id} className="flex flex-col items-end">
                            <div className="bg-[#eb6f45f1] text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm shadow-sm leading-relaxed">
                                {msg.text}
                            </div>
                            <span className="text-xs text-gray-400 mt-1 mr-1">{msg.timestamp}</span>
                        </div>
                    ) : (
                        <div key={msg.id} className="flex flex-col items-start">
                            <div className="bg-gray-50 border border-gray-200 text-gray-800 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%] text-sm shadow-sm leading-relaxed">
                                {msg.text}
                            </div>
                            <span className="text-xs text-gray-400 mt-1 ml-1">{msg.timestamp}</span>
                        </div>
                    )
                ))}
            </div>

            {/* AI Thought Process Indicator (แบบ Accordion) */}
            <div className="mt-6 mb-4 w-full">
                <div className="flex items-center justify-between w-full mb-3">
                    <button 
                        onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                        className="flex items-center space-x-2 text-sm text-[#b0b0b0] font-medium hover:text-gray-600 transition-colors focus:outline-none group"
                    >
                        <IoTrainOutline size={18} className={clsx("transition-transform duration-300", isThinkingExpanded && "text-[#b0b0b0]")} />
                        <span>Thinking...</span>
                        <IoChevronForward 
                            size={14} 
                            className={clsx(
                                "transition-transform duration-300 ease-in-out",
                                isThinkingExpanded && "rotate-90"
                            )} 
                        />
                    </button>
                </div>

                <div 
                    className={clsx(
                        "grid transition-all duration-300 ease-in-out",
                        isThinkingExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                >
                    <div className="overflow-hidden">
                        <div className="border-l-[2px] border-gray-200 ml-2.5 pl-6 py-2 text-sm text-gray-400 flex flex-col space-y-4">
                            <div className="space-y-1.5">
                                <h3 className="font-semibold text-gray-600">1. Understand the User's Request:</h3>
                                <ul className="list-disc list-outside pl-4 space-y-1.5 text-gray-500 marker:text-gray-400">
                                    <li><strong>Query:</strong> "หาข้อมูล เกมเอาชีวิตรอด" (Find information about survival games).</li>
                                    <li><strong>Intent:</strong> The user is asking for an overview, recommendations, or general information about the "survival game" genre.</li>
                                    <li><strong>Tone:</strong> Informative, engaging, and well-structured.</li>
                                    <li><strong>Language:</strong> Thai.</li>
                                </ul>
                            </div>
                            
                            <div className="space-y-1.5">
                                <h3 className="font-semibold text-gray-600">2. Deconstruct the "Survival Game" Genre:</h3>
                                <ul className="list-disc list-outside pl-4 space-y-1.5 text-gray-500 marker:text-gray-400">
                                    <li><em>What is it?</em> Games where the primary goal is to stay alive in a hostile environment.</li>
                                    <li><em>Core Mechanics:</em> Gathering resources, crafting, building shelters, managing stats (hunger, thirst, health, stamina), exploration, combat (PvE or PvP).</li>
                                    <li><em>Sub-genres:</em> Open-world survival craft, Battle Royale, Survival Horror, Colony Sim (often has survival elements).</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};