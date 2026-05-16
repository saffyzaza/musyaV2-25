"use client";
import { HiOutlineSparkles, HiOutlineLightBulb } from "react-icons/hi";
import { FiSearch, FiCpu } from "react-icons/fi";

export function AgentIcon({ name }: { name: string }) {
  if (name === "Orchestrator") return <HiOutlineLightBulb size={10} />;
  if (name === "Research Agent") return <FiSearch size={9} />;
  if (name === "Synthesizer") return <HiOutlineSparkles size={10} />;
  return <FiCpu size={9} />;
}
