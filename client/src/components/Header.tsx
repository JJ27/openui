import { useState, useMemo } from "react";
import { Plus, Folder, Settings, Archive } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "../stores/useStore";
import { SettingsModal } from "./SettingsModal";

export function Header() {
  const { setAddAgentModalOpen, sessions, launchCwd, showArchived, setShowArchived } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Count active (non-archived) sessions by status
  const statusCounts = useMemo(() => {
    const activeSessions = Array.from(sessions.values()).filter(s => !s.archived);

    return {
      working: activeSessions.filter(s =>
        s.status === "running" || s.status === "tool_calling"
      ).length,
      needsInput: activeSessions.filter(s =>
        s.status === "waiting_input"
      ).length,
      idle: activeSessions.filter(s =>
        s.status === "idle"
      ).length,
    };
  }, [sessions]);

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-canvas-dark">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
          <span className="text-sm font-semibold text-white">OpenUI</span>
        </div>
        
        <div className="h-4 w-px bg-border mx-2" />
        
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Folder className="w-3 h-3" />
          <span className="font-mono truncate max-w-[200px]">{launchCwd || "~"}</span>
        </div>
      </div>

      {/* Center - Status counts */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-3 px-3 py-1 rounded-full bg-surface text-xs">
          {/* Working agents */}
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-zinc-400">{statusCounts.working}</span>
          </div>
          {/* Needs input agents */}
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-zinc-400">{statusCounts.needsInput}</span>
          </div>
          {/* Idle agents */}
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            <span className="text-zinc-400">{statusCounts.idle}</span>
          </div>
        </div>
      </div>

      {/* Right side buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`p-2 rounded-md transition-colors ${
            showArchived
              ? "text-orange-400 bg-orange-500/10 hover:bg-orange-500/20"
              : "text-zinc-400 hover:text-white hover:bg-surface-active"
          }`}
          title={showArchived ? "Hide Archived" : "Show Archived"}
        >
          <Archive className="w-4 h-4" />
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <motion.button
          onClick={() => setAddAgentModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-canvas text-sm font-medium hover:bg-zinc-100 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus className="w-4 h-4" />
          New Agent
        </motion.button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
