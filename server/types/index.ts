import type { IPty } from "bun-pty";
import type { ServerWebSocket } from "bun";
import type { Canvas } from "./canvas";

export type AgentStatus = "running" | "waiting_input" | "waiting" | "tool_calling" | "idle" | "disconnected" | "error";

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
  icon?: string;
  notes?: string;
  nodeId: string;
  isRestored?: boolean;
  autoResumed?: boolean; // True if session was auto-resumed on startup
  position?: { x: number; y: number };
  // Ticket/Issue info (for GitHub integration)
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  // Plugin-reported status
  pluginReportedStatus?: boolean;
  lastPluginStatusTime?: number;
  // Claude Code's internal session ID (different from our sessionId)
  claudeSessionId?: string;
  // Current tool being used (from plugin)
  currentTool?: string;
  // Last hook event received
  lastHookEvent?: string;
  // Permission detection
  preToolTime?: number;
  permissionTimeout?: ReturnType<typeof setTimeout>;
  needsInputSince?: number; // Timestamp when waiting_input was set (for subagent override protection)
  // Token usage from cost cache
  tokens?: number;
  // Model name (from plugin hook)
  model?: string;
  // Sleep timer: epoch ms when sleep ends (for countdown display)
  sleepEndTime?: number;
  sleepDuration?: number; // seconds, for recalculating sleepEndTime after permission approval
  // Long-running tool detection (server-side)
  longRunningTool?: boolean;
  longRunningTimeout?: ReturnType<typeof setTimeout>;
  // Archive status
  archived?: boolean;
  // Canvas/tab organization
  canvasId?: string;
  // Runtime-only: throttle git branch checks
  _lastBranchCheck?: number;
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
  icon?: string;
  position: { x: number; y: number };
  claudeSessionId?: string;  // Claude Code's internal session ID for --resume
  archived?: boolean;
  autoResumed?: boolean;  // True if session was auto-resumed on startup
  canvasId: string;  // Canvas/tab this agent belongs to
  gitBranch?: string;
  // Ticket/Issue info
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
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
  canvases?: Canvas[];  // Tab-based workspaces
  categories?: PersistedCategory[];  // Deprecated: kept for migration from folder system
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
