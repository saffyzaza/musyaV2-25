export type ChatMessageRole = "user" | "ai";

export type ChatSessionMessage = {
  id: string;
  role: ChatMessageRole;
  text: string;
  timestamp: string;
};

export type ChatSessionState = {
  sessionId: string;
  status: "idle" | "running" | "completed" | "failed";
  messages: ChatSessionMessage[];
  lastUserPrompt?: string;
  error?: string;
};

export type ChatRouteRequest = {
  sessionId: string;
  prompt: string;
  history: ChatSessionMessage[];
};

export type ChatRouteResponse = {
  message: string;
};