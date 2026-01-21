import type { IPty } from "bun-pty";
import type { ServerWebSocket } from "bun";

export type AgentStatus = "starting" | "running" | "waiting_input" | "tool_calling" | "idle" | "disconnected" | "error";

export interface Session {
  pty: IPty | null;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  gitBranch?: string;
  createdAt: string;
  clients: Set<ServerWebSocket<WebSocketData>>;
  outputBuffer: string[];
  status: AgentStatus;
  lastOutputTime: number;
  lastInputTime: number;
  recentOutputSize: number;
  customName?: string;
  customColor?: string;
  notes?: string;
  nodeId: string;
  isRestored?: boolean;
  metrics?: ClaudeMetrics;
}

export interface ClaudeMetrics {
  model: string;
  cost: number;
  linesAdded: number;
  linesRemoved: number;
  contextPercent: number;
  inputTokens: number;
  outputTokens: number;
  state?: "idle" | "asking" | "working";
}

export interface PersistedNode {
  nodeId: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  createdAt: string;
  customName?: string;
  customColor?: string;
  notes?: string;
  position: { x: number; y: number };
}

export interface PersistedCategory {
  id: string;
  label: string;
  color: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

export interface PersistedState {
  nodes: PersistedNode[];
  categories?: PersistedCategory[];
}

export interface Agent {
  id: string;
  name: string;
  command: string;
  description: string;
  color: string;
  icon: string;
}

export interface WebSocketData {
  sessionId: string;
}
