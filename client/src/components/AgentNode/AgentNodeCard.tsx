import { MessageSquare, WifiOff, FolderGit2, GitBranch } from "lucide-react";
import { AgentStatus, ClaudeMetrics } from "../../stores/useStore";

const statusConfig: Record<AgentStatus, { label: string; color: string; animate?: boolean }> = {
  starting: { label: "Starting", color: "#FBBF24", animate: true },
  running: { label: "Running", color: "#22C55E", animate: true },
  waiting_input: { label: "Needs Input", color: "#F97316", animate: false },
  tool_calling: { label: "Tool Calling", color: "#8B5CF6", animate: true },
  idle: { label: "Idle", color: "#6B7280", animate: false },
  disconnected: { label: "Disconnected", color: "#EF4444", animate: false },
  error: { label: "Error", color: "#EF4444", animate: false },
};

interface AgentNodeCardProps {
  selected: boolean;
  displayColor: string;
  displayName: string;
  Icon: any;
  agentId: string;
  status: AgentStatus;
  metrics?: ClaudeMetrics;
  cwd?: string;
  gitBranch?: string;
}

export function AgentNodeCard({
  selected,
  displayColor,
  displayName,
  Icon,
  agentId,
  status,
  metrics,
  cwd,
  gitBranch,
}: AgentNodeCardProps) {
  const statusInfo = statusConfig[status] || statusConfig.idle;

  // Extract directory name from cwd
  const dirName = cwd ? cwd.split("/").pop() || cwd : null;

  return (
    <div
      className={`relative w-[180px] rounded-lg transition-all duration-200 cursor-pointer ${
        selected ? "ring-1 ring-white/20" : ""
      }`}
      style={{
        backgroundColor: "#262626",
        boxShadow: selected
          ? "0 4px 16px rgba(0, 0, 0, 0.4)"
          : "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div className="h-1 rounded-t-lg" style={{ backgroundColor: displayColor }} />

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${displayColor}20` }}
            >
              <Icon className="w-4 h-4" style={{ color: displayColor }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-white truncate">{displayName}</h3>
              <p className="text-[10px] text-zinc-500 truncate">{agentId}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: statusInfo.color }}
            />
            {statusInfo.animate && (
              <div
                className="absolute w-2 h-2 rounded-full animate-ping"
                style={{ backgroundColor: statusInfo.color, opacity: 0.5 }}
              />
            )}
          </div>
          <span className="text-[10px] text-zinc-500">{statusInfo.label}</span>

          {status === "waiting_input" && (
            <div className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">
              <MessageSquare className="w-2.5 h-2.5 text-orange-500" />
              <span className="text-[9px] text-orange-500 font-medium">Input</span>
            </div>
          )}

          {status === "disconnected" && (
            <div className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
              <WifiOff className="w-2.5 h-2.5 text-red-500" />
              <span className="text-[9px] text-red-500 font-medium">Offline</span>
            </div>
          )}
        </div>

        {/* Directory & Branch */}
        {(dirName || gitBranch) && (
          <div className="mt-2 flex items-center gap-1.5 text-[9px] text-zinc-500">
            <FolderGit2 className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{dirName}</span>
            {gitBranch && (
              <>
                <GitBranch className="w-3 h-3 flex-shrink-0 text-zinc-600" />
                <span className="truncate text-purple-400">{gitBranch}</span>
              </>
            )}
          </div>
        )}

        {/* Metrics for Claude agents */}
        {metrics && agentId === "claude" && (
          <div className="mt-2 pt-2 border-t border-zinc-700/50 space-y-1.5">
            {/* Model & Cost row */}
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-cyan-400 font-medium truncate">{metrics.model}</span>
              <span className="text-blue-400">${metrics.cost.toFixed(4)}</span>
            </div>

            {/* Context bar */}
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] text-zinc-500 w-6">ctx</span>
              <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(metrics.contextPercent, 100)}%`,
                    backgroundColor: metrics.contextPercent > 80 ? "#EF4444" : metrics.contextPercent > 50 ? "#FBBF24" : "#22C55E"
                  }}
                />
              </div>
              <span className="text-[8px] text-zinc-400 w-6 text-right">{Math.round(metrics.contextPercent)}%</span>
            </div>

            {/* Lines & Tokens row */}
            <div className="flex items-center justify-between text-[8px]">
              <span>
                <span className="text-green-400">+{metrics.linesAdded}</span>
                {" "}
                <span className="text-red-400">-{metrics.linesRemoved}</span>
              </span>
              <span className="text-zinc-500">
                {Math.round((metrics.inputTokens + metrics.outputTokens) / 1000)}k tok
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
