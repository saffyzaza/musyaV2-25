import type { AgentStep } from "./chatTypes";

const STREAMING_EVENT = "streaming-state-updated";
const streamingMap = new Map<string, AgentStep[]>();

export function getStreamingSteps(sessionId: string): AgentStep[] | null {
  return streamingMap.get(sessionId) ?? null;
}

export function setStreamingSteps(sessionId: string, steps: AgentStep[]) {
  if (typeof window === "undefined") return;
  streamingMap.set(sessionId, steps);
  window.dispatchEvent(new CustomEvent(STREAMING_EVENT, { detail: { sessionId } }));
}

export function clearStreamingState(sessionId: string) {
  if (typeof window === "undefined") return;
  streamingMap.delete(sessionId);
  window.dispatchEvent(new CustomEvent(STREAMING_EVENT, { detail: { sessionId } }));
}

export function subscribeToStreamingState(sessionId: string | null, onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ sessionId?: string }>).detail;
    if (!sessionId || detail?.sessionId === sessionId) onChange();
  };
  window.addEventListener(STREAMING_EVENT, handler);
  return () => window.removeEventListener(STREAMING_EVENT, handler);
}
