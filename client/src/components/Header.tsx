import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Settings, Archive, Loader2, Search, HelpCircle, MoreHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../stores/useStore";
import { SettingsModal } from "./SettingsModal";
import { ConversationSearchModal } from "./ConversationSearchModal";
import { HelpModal } from "./HelpModal";
import { changelog, type ChangelogEntry } from "../data/changelog";

const MAX_DISPLAY = 10;

export function Header() {
  const { setAddAgentModalOpen, sessions, launchCwd, showArchived, setShowArchived, autoResumeProgress, connected, isRemote } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Track header width for responsive layout
  const headerRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  const [veryCompact, setVeryCompact] = useState(false);

  useEffect(() => {
    if (!headerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCompact(w < 900);
      setVeryCompact(w < 650);
    });
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Isaac usage state
  const [usage, setUsage] = useState<{ daily: string | null; weekly: string | null; monthly: string | null; dailyTokens: string | null } | null>(null);

  useEffect(() => {
    const fetchUsage = () => {
      if (document.hidden) return;
      fetch("/api/usage")
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setUsage(data); })
        .catch(() => {});
    };
    fetchUsage();
    const interval = setInterval(fetchUsage, 60_000);
    const onVisible = () => { if (!document.hidden) fetchUsage(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // "What's New" state
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [firstSeenAt, setFirstSeenAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((config) => {
        setSeenIds(new Set(config.seenUpdateIds || []));
        setFirstSeenAt(config.firstSeenAt || null);
      })
      .catch(() => {});
  }, []);

  const { unseenUpdates, olderUpdates } = useMemo(() => {
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
    const allIds = changelog.slice(0, MAX_DISPLAY).map((e) => e.id);
    const merged = new Set([...seenIds, ...allIds]);
    setSeenIds(merged);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seenUpdateIds: [...merged] }),
    }).catch(() => {});
  }, [seenIds]);

  // Shorten path based on compact mode
  const shortenPath = useCallback((path: string) => {
    const display = path.replace(/^\/home\/[^/]+/, "~") || "~";
    if (veryCompact) {
      // Just the last directory name
      const parts = display.split("/").filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : "~";
    }
    if (compact) {
      // Last 2 segments
      const parts = display.split("/").filter(Boolean);
      if (parts.length <= 2) return display;
      return ".../" + parts.slice(-2).join("/");
    }
    if (display.length <= 50) return display;
    const parts = display.split("/").filter(Boolean);
    if (parts.length <= 5) return display;
    const prefix = parts.slice(0, 2).join("/");
    const suffix = parts.slice(-2).join("/");
    return `${prefix}/.../${suffix}`;
  }, [compact, veryCompact]);

  // Always show the directory openui was launched from (not per-agent worktree paths)
  const displayCwd = launchCwd;

  // Keyboard shortcut listeners
  useEffect(() => {
    const handler = () => setSearchOpen((prev) => !prev);
    window.addEventListener("openui:toggle-search", handler);
    return () => window.removeEventListener("openui:toggle-search", handler);
  }, []);

  useEffect(() => {
    const handler = () => setHelpOpen((prev) => !prev);
    window.addEventListener("openui:toggle-help", handler);
    return () => window.removeEventListener("openui:toggle-help", handler);
  }, []);

  // Status counts
  const statusCounts = useMemo(() => {
    const activeSessions = Array.from(sessions.values()).filter(s => !s.archived);
    return {
      working: activeSessions.filter(s => s.status === "running" || s.status === "tool_calling").length,
      waiting: activeSessions.filter(s => s.status === "waiting").length,
      needsInput: activeSessions.filter(s => s.status === "waiting_input").length,
      idle: activeSessions.filter(s => s.status === "idle").length,
    };
  }, [sessions]);

  const showProgress = autoResumeProgress?.isActive && autoResumeProgress.total > 0;
  const progressPct = autoResumeProgress
    ? Math.round((autoResumeProgress.completed / Math.max(autoResumeProgress.total, 1)) * 100)
    : 0;

  const openCursor = useCallback(() => {
    if (!displayCwd) return;
    const uri = isRemote
      ? `cursor://vscode-remote/ssh-remote+arca.ssh${displayCwd}`
      : `cursor://file${displayCwd}`;
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = uri;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 1000);
  }, [displayCwd, isRemote]);

  // Icon buttons — rendered inline when wide, in dropdown when compact
  const iconButtons = (asMenu: boolean) => {
    const cls = asMenu
      ? "w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
      : "p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors";

    return (
      <>
        <button
          onClick={() => { setHelpOpen(true); setMenuOpen(false); }}
          className={`relative ${cls}`}
          title="Help & Shortcuts (?)"
        >
          <HelpCircle className="w-4 h-4" />
          {asMenu && <span>Help</span>}
          {unseenUpdates.length > 0 && (
            <span className={`${asMenu ? "ml-auto" : "absolute top-1 right-1"} w-2 h-2 rounded-full bg-blue-500`} />
          )}
        </button>
        <button
          onClick={() => { setSearchOpen(true); setMenuOpen(false); }}
          className={cls}
          title="Search Conversations (Cmd+K)"
        >
          <Search className="w-4 h-4" />
          {asMenu && <span>Search</span>}
        </button>
        <button
          onClick={() => { setShowArchived(!showArchived); setMenuOpen(false); }}
          className={asMenu
            ? `w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${showArchived ? "text-orange-400 hover:bg-orange-500/10" : "text-zinc-400 hover:text-white hover:bg-surface-active"}`
            : `p-2 rounded-md transition-colors ${showArchived ? "text-orange-400 bg-orange-500/10 hover:bg-orange-500/20" : "text-zinc-400 hover:text-white hover:bg-surface-active"}`
          }
          title={showArchived ? "Hide Archived" : "Show Archived"}
        >
          <Archive className="w-4 h-4" />
          {asMenu && <span>{showArchived ? "Hide Archived" : "Show Archived"}</span>}
        </button>
        <button
          onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}
          className={cls}
          title="Settings"
        >
          <Settings className="w-4 h-4" />
          {asMenu && <span>Settings</span>}
        </button>
      </>
    );
  };

  return (
    <header ref={headerRef} className="h-14 px-4 flex items-center justify-between border-b border-border bg-canvas-dark">
      {/* Left: Logo + Cursor + Path */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
          {!veryCompact && <span className="text-sm font-semibold text-white">OpenUI</span>}
          <div
            className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500 animate-pulse"}`}
            title={connected ? "Connected" : "Disconnected"}
          />
        </div>

        <div className="h-4 w-px bg-border mx-1 flex-shrink-0" />

        <button
          onClick={openCursor}
          className="h-6 px-2 rounded-full flex items-center gap-1.5 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-colors text-[11px] flex-shrink-0"
          title="Open in Cursor"
        >
          <svg width="12" height="12" viewBox="675 357 250 286" fill="none">
            <path d="M800 500L923.821 571.486C923.061 572.804 921.957 573.929 920.591 574.716L804.863 641.531C801.858 643.266 798.151 643.266 795.146 641.531L679.417 574.716C678.052 573.929 676.948 572.804 676.188 571.486L800 500Z" fill="currentColor" opacity="0.5"/>
            <path d="M800 357.168V500L676.188 571.486C675.427 570.168 675.004 568.647 675.004 567.072V432.928C675.004 429.774 676.686 426.865 679.418 425.285L795.141 358.47C796.646 357.602 798.323 357.168 800 357.168Z" fill="currentColor" opacity="0.7"/>
            <path d="M923.815 428.515C923.055 427.197 921.951 426.072 920.586 425.285L804.857 358.47C803.357 357.602 801.68 357.168 800 357.168V500L923.821 571.486C924.581 570.168 925.005 568.647 925.005 567.072V432.928C925.005 431.348 924.587 429.838 923.821 428.515Z" fill="currentColor"/>
          </svg>
          {!compact && "Cursor"}
        </button>
        <span className="font-mono text-xs text-zinc-500 truncate whitespace-nowrap min-w-0" title={displayCwd?.replace(/^\/home\/[^/]+/, "~") || "~"}>
          {shortenPath(displayCwd || "")}
        </span>
      </div>

      {/* Right: Status + Menu + New Agent */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Inline status counts / progress */}
        <AnimatePresence mode="wait">
          {showProgress ? (
            <motion.div
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface text-xs"
            >
              <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
              <span className="text-zinc-400">
                {autoResumeProgress!.completed}/{autoResumeProgress!.total}
              </span>
              {!veryCompact && (
                <div className="w-16 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-violet-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2.5 px-2.5 py-1 rounded-full bg-surface text-xs"
              data-tour="status-badges"
            >
              <div className="flex items-center gap-1" title="Working">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-zinc-400">{statusCounts.working}</span>
              </div>
              {statusCounts.waiting > 0 && (
                <div className="flex items-center gap-1" title="Waiting">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span className="text-zinc-400">{statusCounts.waiting}</span>
                </div>
              )}
              <div className="flex items-center gap-1" title="Needs input">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                <span className="text-zinc-400">{statusCounts.needsInput}</span>
              </div>
              <div className="flex items-center gap-1" title="Idle">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <span className="text-zinc-400">{statusCounts.idle}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline daily spend */}
        {usage && usage.daily && !veryCompact && (
          <div className="flex items-center px-2 py-1 rounded-full bg-surface text-[11px] text-zinc-500 font-mono">
            ${usage.daily} today
          </div>
        )}

        {/* Dropdown menu for all secondary actions */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="relative p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
            {unseenUpdates.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500" />
            )}
          </button>
          {menuOpen && createPortal(
            <div
              ref={(el) => {
                dropdownRef.current = el;
                // Position the portal dropdown relative to the menu button
                if (el && menuRef.current) {
                  const rect = menuRef.current.getBoundingClientRect();
                  el.style.top = `${rect.bottom + 4}px`;
                  el.style.right = `${window.innerWidth - rect.right}px`;
                }
              }}
              className="fixed w-48 rounded-lg bg-surface border border-border shadow-2xl py-1 overflow-hidden"
              style={{ zIndex: 99999 }}
            >
              {iconButtons(true)}
              {usage && usage.daily && (
                <>
                  <div className="h-px bg-border my-1" />
                  <div className="px-3 py-2 text-[10px] text-zinc-600 font-mono">
                    ${usage.daily} today{usage.dailyTokens ? ` · ${usage.dailyTokens} tok` : ""}{usage.weekly ? ` · $${usage.weekly} wk` : ""}
                  </div>
                </>
              )}
            </div>,
            document.body
          )}
        </div>

        <motion.button
          data-tour="new-agent"
          onClick={() => setAddAgentModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-canvas text-sm font-medium hover:bg-zinc-100 transition-colors flex-shrink-0"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Plus className="w-4 h-4" />
          {!veryCompact && "New Agent"}
        </motion.button>
      </div>

      <HelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        unseenUpdates={unseenUpdates}
        olderUpdates={olderUpdates}
        onMarkAsSeen={markAsSeen}
        onRestartTour={() => {
          fetch("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tourCompleted: false }),
          })
            .then(() => window.dispatchEvent(new CustomEvent("openui:restart-tour")))
            .catch(() => {});
        }}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConversationSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onResume={(conv) => {
          setSearchOpen(false);
          useStore.getState().setPendingResumeConversation(conv);
          setAddAgentModalOpen(true);
        }}
      />
    </header>
  );
}
