import { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, Folder, Settings, Archive, Loader2, Search, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../stores/useStore";
import { SettingsModal } from "./SettingsModal";
import { ConversationSearchModal } from "./ConversationSearchModal";
import { HelpModal } from "./HelpModal";
import { changelog, type ChangelogEntry } from "../data/changelog";

const MAX_DISPLAY = 10;

export function Header() {
  const { setAddAgentModalOpen, sessions, launchCwd, showArchived, setShowArchived, autoResumeProgress } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // "What's New" state
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [firstSeenAt, setFirstSeenAt] = useState<string | null>(null);

  // Fetch seen state from server on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((config) => {
        setSeenIds(new Set(config.seenUpdateIds || []));
        setFirstSeenAt(config.firstSeenAt || null);
      })
      .catch(() => {});
  }, []);

  // Compute unseen / older updates (capped to MAX_DISPLAY total)
  const { unseenUpdates, olderUpdates } = useMemo(() => {
    // Filter to entries the user should see (only those after their first visit)
    const visible = firstSeenAt
      ? changelog.filter((e) => e.date >= firstSeenAt)
      : [];
    const capped = visible.slice(0, MAX_DISPLAY);
    const unseen: ChangelogEntry[] = [];
    const older: ChangelogEntry[] = [];
    for (const entry of capped) {
      if (seenIds.has(entry.id)) {
        older.push(entry);
      } else {
        unseen.push(entry);
      }
    }
    return { unseenUpdates: unseen, olderUpdates: older };
  }, [seenIds, firstSeenAt]);

  const markAsSeen = useCallback(() => {
    // Mark all visible entries as seen
    const allIds = changelog.slice(0, MAX_DISPLAY).map((e) => e.id);
    const merged = new Set([...seenIds, ...allIds]);
    setSeenIds(merged);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seenUpdateIds: [...merged] }),
    }).catch(() => {});
  }, [seenIds]);

  // Listen for Cmd+K toggle event from App.tsx keyboard handler
  useEffect(() => {
    const handler = () => setSearchOpen((prev) => !prev);
    window.addEventListener("openui:toggle-search", handler);
    return () => window.removeEventListener("openui:toggle-search", handler);
  }, []);

  // Listen for help toggle event from App.tsx keyboard handler
  useEffect(() => {
    const handler = () => setHelpOpen((prev) => !prev);
    window.addEventListener("openui:toggle-help", handler);
    return () => window.removeEventListener("openui:toggle-help", handler);
  }, []);

  // Count active (non-archived) sessions by status
  const statusCounts = useMemo(() => {
    const activeSessions = Array.from(sessions.values()).filter(s => !s.archived);

    return {
      working: activeSessions.filter(s =>
        s.status === "running" || s.status === "tool_calling"
      ).length,
      waiting: activeSessions.filter(s =>
        s.status === "waiting"
      ).length,
      needsInput: activeSessions.filter(s =>
        s.status === "waiting_input"
      ).length,
      idle: activeSessions.filter(s =>
        s.status === "idle"
      ).length,
    };
  }, [sessions]);

  const showProgress = autoResumeProgress?.isActive && autoResumeProgress.total > 0;
  const progressPct = autoResumeProgress
    ? Math.round((autoResumeProgress.completed / Math.max(autoResumeProgress.total, 1)) * 100)
    : 0;

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

      {/* Center - Status counts or auto-resume progress */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <AnimatePresence mode="wait">
          {showProgress ? (
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface text-xs"
            >
              <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
              <span className="text-zinc-400">
                Restoring agents... {autoResumeProgress!.completed}/{autoResumeProgress!.total}
              </span>
              <div className="w-20 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-violet-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="status"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-3 px-3 py-1 rounded-full bg-surface text-xs"
              data-tour="status-badges"
            >
              {/* Working agents */}
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-zinc-400">{statusCounts.working}</span>
              </div>
              {/* Waiting agents (only shown when > 0) */}
              {statusCounts.waiting > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span className="text-zinc-400">{statusCounts.waiting}</span>
                </div>
              )}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right side buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setHelpOpen(true)}
          className="relative p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Help & Shortcuts (?)"
        >
          <HelpCircle className="w-4 h-4" />
          {unseenUpdates.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500" />
          )}
        </button>
        <button
          onClick={() => setSearchOpen(true)}
          className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Search Conversations (Cmd+K)"
        >
          <Search className="w-4 h-4" />
        </button>
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
          data-tour="new-agent"
          onClick={() => setAddAgentModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-canvas text-sm font-medium hover:bg-zinc-100 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus className="w-4 h-4" />
          New Agent
        </motion.button>
      </div>

      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        unseenUpdates={unseenUpdates}
        olderUpdates={olderUpdates}
        onMarkAsSeen={markAsSeen}
        onRestartTour={() => {
          // Reset tour completion in server config, then reload
          fetch("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tourCompleted: false }),
          })
            .then(() => window.location.reload())
            .catch(() => {});
        }}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConversationSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onResume={(conv) => {
          setSearchOpen(false);
          // Store the conversation to resume, then open the new agent modal
          useStore.getState().setPendingResumeConversation(conv);
          setAddAgentModalOpen(true);
        }}
      />
    </header>
  );
}
