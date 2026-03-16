import { useState, useEffect } from "react";
import { MessageSquare, WifiOff, GitBranch, Folder, Wrench, Clock, Zap, Flame, Archive, Trash2, Loader2, Coffee, AlertTriangle, RefreshCw } from "lucide-react";
import { AgentStatus } from "../../stores/useStore";

// Status config with visual priority levels
const statusConfig: Record<AgentStatus, { label: string; color: string; isActive?: boolean; needsAttention?: boolean }> = {
  running: { label: "Working", color: "#22C55E", isActive: true },
  tool_calling: { label: "Working", color: "#22C55E", isActive: true },
  waiting: { label: "Waiting", color: "#6366F1" },
  compacting: { label: "Compacting", color: "#06B6D4" },
  waiting_input: { label: "Needs Input", color: "#F97316", needsAttention: true },
  idle: { label: "Idle", color: "#FBBF24", needsAttention: true },
  disconnected: { label: "Offline", color: "#6B7280" },
  error: { label: "Error", color: "#EF4444", needsAttention: true },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

function formatModelName(model: string): string {
  // Extract context window suffix like [1m], [200k] etc.
  const ctxMatch = model.match(/\[(\d+[mk])\]/i);
  const ctxSuffix = ctxMatch ? ` (${ctxMatch[1].toUpperCase()})` : "";
  const base = model.replace(/\[.*\]/, "");

  // "claude-sonnet-4-6" → "Sonnet 4.6"
  // "claude-opus-4-6[1m]" → "Opus 4.6 (1M)"
  // "claude-haiku-4-5-20251001" → "Haiku 4.5"
  const m = base.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (m) return `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} ${m[2]}.${m[3]}${ctxSuffix}`;

  // Short names: "opus[1m]" → "Opus (1M)", "sonnet" → "Sonnet"
  const short = base.match(/^(opus|sonnet|haiku)$/i);
  if (short) return `${short[1].charAt(0).toUpperCase() + short[1].slice(1)}${ctxSuffix}`;

  return model;
}

function formatSleepTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Tool name display mapping
const toolDisplayNames: Record<string, string> = {
  Read: "Reading",
  Write: "Writing",
  Edit: "Editing",
  Bash: "Running",
  Grep: "Searching",
  Glob: "Finding",
  Task: "Tasking",
  WebFetch: "Fetching",
  WebSearch: "Searching",
  TodoWrite: "Planning",
  AskUserQuestion: "Asking",
};

interface AgentNodeCardProps {
  selected: boolean;
  displayColor: string;
  displayName: string;
  Icon: any;
  agentId: string;
  status: AgentStatus;
  currentTool?: string;
  cwd?: string;
  gitBranch?: string;
  ticketId?: string;
  ticketTitle?: string;
  longRunningTool?: boolean;
  tokens?: number;
  totalTokens?: number;
  model?: string;
  command?: string;
  sleepEndTime?: number;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function AgentNodeCard({
  selected,
  displayColor,
  displayName,
  Icon,
  agentId,
  status,
  currentTool,
  cwd,
  gitBranch,
  ticketId,
  ticketTitle,
  longRunningTool,
  tokens,
  totalTokens,
  model,
  command,
  sleepEndTime,
  onArchive,
  onDelete,
}: AgentNodeCardProps) {
  const statusInfo = statusConfig[status] || statusConfig.idle;
  const isActive = statusInfo.isActive;
  const isToolCalling = status === "tool_calling";
  const needsAttention = statusInfo.needsAttention;
  const isWaiting = status === "waiting";
  const isCompacting = status === "compacting";
  const isCalm = isWaiting || isCompacting; // Calm states: subtle border, no glow

  // When cwd is a worktree root like .../universe/.isaac/worktree_pool/worktree-02,
  // the last segment "worktree-02" is meaningless — show the repo name instead.
  // If the agent cd's into a subdir, the last segment is already useful as-is.
  const dirName = cwd
    ? (cwd.match(/\/([^/]+)\/\.isaac\/worktree_pool\/worktree-\d+$/)?.[1]
      || cwd.split("/").pop()
      || cwd)
    : null;

  // Get display name for current tool
  const toolDisplay = currentTool ? (toolDisplayNames[currentTool] || currentTool) : null;

  // Sleep countdown timer
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!sleepEndTime) {
      setSleepRemaining(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((sleepEndTime - Date.now()) / 1000));
      setSleepRemaining(left > 0 ? left : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepEndTime]);

  return (
    <div
      className={`group relative w-[220px] rounded-lg transition-all duration-300 cursor-pointer ${
        selected ? "ring-1 ring-white/20" : ""
      }`}
      style={{
        backgroundColor: "#1a1a1a",
        border: needsAttention
          ? `2px solid ${statusInfo.color}`
          : isActive || isCalm
          ? `1px solid ${statusInfo.color}40`
          : "1px solid #2a2a2a",
        boxShadow: needsAttention
          ? `0 0 16px ${statusInfo.color}40, 0 0 32px ${statusInfo.color}20, 0 4px 12px rgba(0, 0, 0, 0.4)`
          : isActive || isCalm
          ? `0 0 12px ${statusInfo.color}15, 0 4px 12px rgba(0, 0, 0, 0.4)`
          : selected
          ? "0 8px 24px rgba(0, 0, 0, 0.6)"
          : "0 4px 12px rgba(0, 0, 0, 0.4)",
      }}
    >
      {/* Animated effects for different states */}
      {isActive && !needsAttention && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${statusInfo.color}20, transparent)`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s ease-in-out infinite',
          }}
        />
      )}
      {/* Pulsing glow for attention states */}
      {needsAttention && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            boxShadow: `0 0 20px ${statusInfo.color}50, 0 0 40px ${statusInfo.color}25`,
            animation: 'attention-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Hover action buttons */}
      {(onArchive || onDelete) && (
        <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onArchive && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-amber-400 transition-colors"
              title="Archive"
            >
              <Archive className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Status banner */}
      <div
        className="px-3 py-1.5 flex items-center gap-2 relative"
        style={{ borderBottom: `1px solid ${statusInfo.color}20` }}
      >
        {/* Status icon */}
        {status === "running" || status === "tool_calling" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: statusInfo.color }} />
        ) : status === "waiting_input" ? (
          <MessageSquare className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : status === "waiting" ? (
          <Clock className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : status === "compacting" ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: statusInfo.color }} />
        ) : status === "idle" ? (
          <Coffee className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : status === "error" ? (
          <AlertTriangle className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : status === "disconnected" ? (
          <WifiOff className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : (
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusInfo.color }} />
        )}
        <span className="text-xs font-medium" style={{ color: statusInfo.color }}>
          {statusInfo.label}
        </span>
        {/* Sleep countdown timer */}
        {isWaiting && sleepRemaining != null && (
          <span className="text-[10px] flex items-center gap-1" style={{ color: statusInfo.color }}>
            <Clock className="w-2.5 h-2.5" />
            {formatSleepTime(sleepRemaining)}
          </span>
        )}
        {/* Show long-running indicator or current tool */}
        {!isWaiting && longRunningTool && (
          <span className="text-[10px] text-zinc-400 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            Long task
          </span>
        )}
        {!isWaiting && isToolCalling && toolDisplay && !longRunningTool && (
          <span className="text-[10px] text-zinc-400 flex items-center gap-1">
            <Wrench className="w-2.5 h-2.5" />
            {toolDisplay}
          </span>
        )}
      </div>

      <div className="p-3 relative">
        {/* Agent name and icon */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${displayColor}20` }}
          >
            <Icon className="w-5 h-5" style={{ color: displayColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white truncate leading-tight">{displayName}</h3>
            <p className="text-[10px] text-zinc-500">
              {command?.startsWith("isaac") ? "isaac" : command?.startsWith("claude") ? "claude" : null}
              {command?.startsWith("isaac") || command?.startsWith("claude") ? " · " : ""}
              {model ? formatModelName(model) : agentId}
            </p>
          </div>
        </div>

        {/* Ticket/Issue info */}
        {ticketId && (
          <div className="mt-2.5 px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-semibold text-blue-400">{ticketId}</span>
            </div>
            {ticketTitle && (
              <p className="text-[10px] text-blue-300/70 truncate mt-0.5">{ticketTitle}</p>
            )}
          </div>
        )}

        {/* Repo, Branch & Tokens */}
        {(dirName || gitBranch || (tokens != null && tokens > 0) || (totalTokens != null && totalTokens > 0)) && (
          <div className="mt-2 space-y-1">
            {dirName && (
              <div className="flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                <span className="text-[11px] text-zinc-400 font-mono truncate">{dirName}</span>
              </div>
            )}
            {gitBranch && (
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                <span className="text-[11px] text-purple-400 font-mono truncate">{gitBranch}</span>
              </div>
            )}
            {tokens != null && tokens > 0 && (
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                <span className="text-[11px] text-zinc-400 font-mono">{formatTokens(tokens)} <span className="text-zinc-500">session</span></span>
              </div>
            )}
            {totalTokens != null && totalTokens > 0 && totalTokens !== tokens && (
              <div className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
                <span className="text-[11px] text-zinc-500 font-mono">{formatTokens(totalTokens)} <span className="text-zinc-600">all</span></span>
              </div>
            )}
          </div>
        )}

      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes attention-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
