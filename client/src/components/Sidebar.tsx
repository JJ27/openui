import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Terminal as TerminalIcon,
  Clock,
  Edit3,
  RotateCcw,
  Sparkles,
  Code,
  Cpu,
  Zap,
  Rocket,
  Bot,
  Brain,
  Wand2,
  GitBranch,
  GitFork,
  Archive,
  Trash2,
  Plus,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react";
import { useStore } from "../stores/useStore";
import { useTerminalPool } from "../contexts/TerminalPoolContext";
import { ResizeHandle } from "./ResizeHandle";
import { ForkDialog, type ForkDialogResult } from "./ForkDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { deleteSessionWithCleanup } from "../utils/deleteSession";

const presetColors = [
  "#F97316", "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#FBBF24", "#14B8A6"
];

const iconOptions = [
  { id: "sparkles", icon: Sparkles, label: "Sparkles" },
  { id: "code", icon: Code, label: "Code" },
  { id: "cpu", icon: Cpu, label: "CPU" },
  { id: "zap", icon: Zap, label: "Zap" },
  { id: "rocket", icon: Rocket, label: "Rocket" },
  { id: "bot", icon: Bot, label: "Bot" },
  { id: "brain", icon: Brain, label: "Brain" },
  { id: "wand2", icon: Wand2, label: "Wand" },
];

interface MountedTerminal {
  id: string;
  sessionId: string;
  nodeId: string;
  color: string;
  isShell?: boolean;
}

function PooledTerminalMount({
  terminalId,
  terminals,
}: {
  terminalId: string | null;
  terminals: Record<string, MountedTerminal>;
}) {
  const pool = useTerminalPool();
  const mountRef = useRef<HTMLDivElement>(null);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Detach previous terminal if switching
    if (prevIdRef.current && prevIdRef.current !== terminalId) {
      pool.detach(prevIdRef.current);
    }

    // Attach new terminal
    if (terminalId) {
      const info = terminals[terminalId];
      if (info) {
        pool.acquire(terminalId, info.sessionId, info.nodeId, info.color, !!info.isShell);
        pool.attachTo(terminalId, mountRef.current);
      }
    }

    prevIdRef.current = terminalId;
  }, [terminalId, terminals, pool]);

  // Detach on unmount (sidebar closing)
  useEffect(() => {
    return () => {
      if (prevIdRef.current) {
        pool.detach(prevIdRef.current);
        prevIdRef.current = null;
      }
    };
  }, [pool]);

  return (
    <div
      ref={mountRef}
      className="w-full h-full"
      style={{ backgroundColor: "#0d0d0d" }}
    />
  );
}

export function Sidebar() {
  const {
    sidebarOpen,
    setSidebarOpen,
    selectedNodeId,
    sessions,
    setSelectedNodeId,
    updateSession,
    updateNode,
    nodes,
    setNewSessionModalOpen,
    setNewSessionForNodeId,
    unarchiveSession,
    showArchived,
    addNode,
    addSession,
    activeCanvasId,
    sidebarWidth,
    setSidebarWidth,
    shellTabs: shellTabsMap,
    setShellTabs,
  } = useStore();

  const pool = useTerminalPool();
  const session = selectedNodeId ? sessions.get(selectedNodeId) : null;
  const node = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mountedTerminals, setMountedTerminals] = useState<Record<string, MountedTerminal>>({});
  const sidebarRef = useRef<HTMLDivElement>(null);

  const [shellsRestored, setShellsRestored] = useState(false);

  // Restore persisted shell tabs from server on mount
  useEffect(() => {
    if (shellsRestored) return;
    fetch("/api/shells")
      .then(res => res.ok ? res.json() : [])
      .then((shells: { shellId: string; nodeId: string; cwd: string; createdAt: string }[]) => {
        const currentTabs = useStore.getState().shellTabs;
        for (const shell of shells) {
          if (!shell.nodeId) continue;
          const existing = currentTabs.get(shell.nodeId) || [];
          // Avoid duplicates (e.g. if already created in this session)
          if (existing.some(t => t.shellId === shell.shellId)) continue;
          const updated = [...existing, { id: shell.shellId, shellId: shell.shellId }];
          setShellTabs(shell.nodeId, updated);
        }
        setShellsRestored(true);
      })
      .catch(() => setShellsRestored(true));
  }, [shellsRestored, setShellTabs]);
  const shellTabs = selectedNodeId ? (shellTabsMap.get(selectedNodeId) || []) : [];
  const [activeTerminalTab, setActiveTerminalTab] = useState<string>("agent");
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Reset edit state when session changes (but NOT when nodes change)
  useEffect(() => {
    if (session) {
      setEditName(session.customName || session.agentName);
      setEditNotes(session.notes || "");
      setEditColor(session.customColor || session.color);
      const currentNode = nodes.find(n => n.id === selectedNodeId);
      const nodeIcon = currentNode?.data?.icon;
      setEditIcon(typeof nodeIcon === 'string' ? nodeIcon : "cpu");
      setIsEditing(false);
      setShowMenu(false);
      setActiveTerminalTab("agent");
    }
  }, [session?.sessionId]); // Removed nodes and selectedNodeId to prevent closing on updates

  const handleClose = () => {
    // Just close the sidebar UI — shell tabs persist in the Zustand store
    // so they reappear when the panel is reopened for the same node.
    setActiveTerminalTab("agent");
    setSidebarOpen(false);
    setSelectedNodeId(null);
    setIsEditing(false);
  };

  const handleNewSession = () => {
    if (selectedNodeId) {
      setNewSessionForNodeId(selectedNodeId);
      setNewSessionModalOpen(true);
    }
  };

  const handleNewShellTab = useCallback(async () => {
    if (!session || !selectedNodeId) return;
    try {
      const res = await fetch("/api/shell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: session.cwd, nodeId: selectedNodeId }),
      });
      if (!res.ok) return;
      const { shellId } = await res.json();
      const tabId = `shell-${Date.now()}`;
      const newTab = { id: tabId, shellId };

      if (selectedNodeId) {
        const updated = [...(shellTabsMap.get(selectedNodeId) || []), newTab];
        setShellTabs(selectedNodeId, updated);
      }
      setActiveTerminalTab(tabId);
    } catch (e) {
      console.error("Failed to create shell:", e);
    }
  }, [session, selectedNodeId]);

  const upsertMountedTerminal = useCallback((terminal: MountedTerminal) => {
    setMountedTerminals((prev) => {
      const existing = prev[terminal.id];
      if (
        existing
        && existing.sessionId === terminal.sessionId
        && existing.nodeId === terminal.nodeId
        && existing.color === terminal.color
        && existing.isShell === terminal.isShell
      ) {
        return prev;
      }
      return { ...prev, [terminal.id]: terminal };
    });
  }, []);

  const removeMountedTerminal = useCallback((terminalId: string) => {
    setMountedTerminals((prev) => {
      if (!prev[terminalId]) return prev;
      const next = { ...prev };
      delete next[terminalId];
      return next;
    });
  }, []);

  const handleCloseShellTab = useCallback(async (tabId: string, shellId: string) => {
    // Kill the PTY
    try {
      await fetch(`/api/shell/${shellId}`, { method: "DELETE" });
    } catch {}

    if (selectedNodeId) {
      const updated = (shellTabsMap.get(selectedNodeId) || []).filter(t => t.id !== tabId);
      setShellTabs(selectedNodeId, updated);
    }

    removeMountedTerminal(`shell:${shellId}`);

    // Switch to agent tab if the closed tab was active
    setActiveTerminalTab(prev => prev === tabId ? "agent" : prev);
  }, [removeMountedTerminal, selectedNodeId]);

  const canFork = session?.agentId === "claude";

  const handleFork = () => {
    setForkDialogOpen(true);
  };

  const handleForkConfirm = async (opts: ForkDialogResult) => {
    if (!selectedNodeId || !session) return;
    const parentNode = nodes.find(n => n.id === selectedNodeId);
    const parentPos = parentNode?.position || { x: 0, y: 0 };
    const forkPos = { x: parentPos.x + 250, y: parentPos.y + 60 };

    const res = await fetch(`/api/sessions/${session.sessionId}/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        position: forkPos,
        canvasId: activeCanvasId,
        customName: opts.name,
        customColor: opts.color,
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
        ...(opts.branchName ? {
          branchName: opts.branchName,
          baseBranch: opts.baseBranch,
        } : {}),
        ...(opts.prNumber ? { prNumber: opts.prNumber } : {}),
      }),
    });
    if (!res.ok) return;
    const data = await res.json();

    const nodeData = parentNode?.data as any;
    addNode({
      id: data.nodeId,
      type: "agent",
      position: forkPos,
      data: {
        label: data.customName || opts.name || "Fork",
        agentId: data.agentId || session.agentId,
        color: data.customColor || opts.color || session.color,
        icon: opts.icon || nodeData?.icon || "sparkles",
        sessionId: data.sessionId,
        canvasId: activeCanvasId,
      },
    });
    addSession(data.nodeId, {
      id: data.nodeId,
      sessionId: data.sessionId,
      agentId: data.agentId || session.agentId,
      agentName: data.agentName || session.agentName,
      command: session.command,
      color: data.customColor || opts.color || session.color,
      createdAt: new Date().toISOString(),
      cwd: data.cwd || session.cwd,
      gitBranch: data.gitBranch,
      status: "running",
      customName: data.customName,
      customColor: data.customColor,
    });
    setSelectedNodeId(data.nodeId);
    setForkDialogOpen(false);
  };

  const displayColor = editColor || session?.customColor || session?.color || "#888";
  const isDisconnected = session?.status === "disconnected";

  useEffect(() => {
    if (!session || !selectedNodeId) return;
    upsertMountedTerminal({
      id: `agent:${session.sessionId}`,
      sessionId: session.sessionId,
      nodeId: selectedNodeId,
      color: displayColor,
    });
  }, [displayColor, selectedNodeId, session, upsertMountedTerminal]);

  useEffect(() => {
    if (!selectedNodeId) return;
    for (const tab of shellTabs) {
      upsertMountedTerminal({
        id: `shell:${tab.shellId}`,
        sessionId: tab.shellId,
        nodeId: selectedNodeId,
        color: "#888",
        isShell: true,
      });
    }
  }, [selectedNodeId, shellTabs, upsertMountedTerminal]);

  useEffect(() => {
    setMountedTerminals((prev) => {
      const activeShellIds = new Set(
        Array.from(shellTabsMap.values()).flat().map((tab) => tab.shellId)
      );
      const activeAgentSessionIds = new Set(
        Array.from(sessions.values()).map((item) => item.sessionId)
      );

      let changed = false;
      const next: Record<string, MountedTerminal> = {};
      for (const [terminalId, terminal] of Object.entries(prev)) {
        const keep = terminal.isShell
          ? activeShellIds.has(terminal.sessionId)
          : activeAgentSessionIds.has(terminal.sessionId);

        if (keep) {
          next[terminalId] = terminal;
        } else {
          changed = true;
          // Release from pool when session/shell is removed
          pool.release(terminalId);
        }
      }

      return changed ? next : prev;
    });
  }, [sessions, shellTabsMap]);

  const activeTerminalId = activeTerminalTab === "agent"
    ? (session ? `agent:${session.sessionId}` : null)
    : (() => {
        const tab = shellTabs.find((item) => item.id === activeTerminalTab);
        return tab ? `shell:${tab.shellId}` : null;
      })();

  return (
    <>
    <AnimatePresence>
      {sidebarOpen && session && (
        <motion.div
          ref={sidebarRef}
          key="sidebar"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={terminalMaximized ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 40 }}
          className={`fixed z-50 flex flex-col bg-canvas-dark ${terminalMaximized ? "inset-0" : "right-0 top-14 bottom-0 border-l border-border"}`}
          style={terminalMaximized ? undefined : { width: `${sidebarWidth}vw` }}
        >
          {!terminalMaximized && (
            <ResizeHandle
              onResize={(widthPx) => {
                const pct = (widthPx / window.innerWidth) * 100;
                // Set DOM directly to bypass Framer Motion
                if (sidebarRef.current) {
                  sidebarRef.current.style.width = `${pct}vw`;
                }
                setSidebarWidth(pct);
                localStorage.setItem("openui-sidebar-pct", pct.toString());
              }}
              initialWidth={sidebarWidth}
              minWidth={320}
            />
          )}
          {/* Header + Tab Row */}
          <div className="flex-shrink-0 border-b border-border">
            <div className="flex items-center px-3 py-1.5 gap-2">
              {/* Node name — hidden when maximized */}
              {!terminalMaximized && (
                <>
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: displayColor }}
                  />
                  <span className="text-xs font-medium text-white truncate max-w-[120px] flex-shrink-0">
                    {session.customName || session.agentName}
                  </span>
                </>
              )}

              {/* Terminal tabs */}
              <div className="flex items-center overflow-x-auto flex-1 min-w-0 gap-0.5">
                <button
                  onClick={() => setActiveTerminalTab("agent")}
                  className={`flex items-center gap-1 px-2 py-1 text-xs whitespace-nowrap rounded transition-colors ${
                    activeTerminalTab === "agent"
                      ? "bg-zinc-700/50 text-zinc-200"
                      : "text-zinc-500 hover:text-zinc-400"
                  }`}
                >
                  <TerminalIcon className="w-3 h-3" />
                  Agent
                </button>

                {shellTabs.map((tab, i) => (
                  <div
                    key={tab.id}
                    className={`flex items-center gap-0.5 px-2 py-1 text-xs whitespace-nowrap rounded transition-colors group cursor-pointer ${
                      activeTerminalTab === tab.id
                        ? "bg-zinc-700/50 text-zinc-200"
                        : "text-zinc-500 hover:text-zinc-400"
                    }`}
                    onClick={() => setActiveTerminalTab(tab.id)}
                  >
                    Shell {i + 1}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseShellTab(tab.id, tab.shellId);
                      }}
                      className="w-3.5 h-3.5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-zinc-600 transition-all ml-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}

                <button
                  onClick={handleNewShellTab}
                  className="flex items-center justify-center w-6 h-6 text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
                  title="New Terminal"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {/* Right-side buttons */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => setTerminalMaximized(m => !m)}
                  className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
                  title={terminalMaximized ? "Restore" : "Maximize"}
                >
                  {terminalMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                {!terminalMaximized && (
                  <button
                    ref={menuButtonRef}
                    onClick={() => setShowMenu(m => !m)}
                    className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
                      showMenu
                        ? "text-white bg-surface-active"
                        : "text-zinc-500 hover:text-white hover:bg-surface-active"
                    }`}
                    title="More actions"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
                  title="Close panel"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Disconnected banner */}
          {isDisconnected && !terminalMaximized && (
            <div className="flex-shrink-0 px-4 py-3 bg-red-500/10 border-b border-red-500/20">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-red-400 font-medium">Session Disconnected</p>
                  <p className="text-xs text-red-400/70 mt-0.5">Resume to continue or start fresh.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      // Call restart endpoint to resume the session
                      try {
                        const res = await fetch(`/api/sessions/${session.sessionId}/restart`, {
                          method: "POST",
                        });
                        if (res.ok) {
                          if (showArchived) {
                            // Resuming from archived view — reload to show on active canvas
                            window.location.reload();
                          } else {
                            // Force terminal refresh for the resumed session
                            const terminalId = `agent:${session.sessionId}`;
                            removeMountedTerminal(terminalId);
                            requestAnimationFrame(() => {
                              upsertMountedTerminal({
                                id: terminalId,
                                sessionId: session.sessionId,
                                nodeId: selectedNodeId!,
                                color: displayColor,
                              });
                            });
                            updateSession(selectedNodeId!, { status: "running", isRestored: false });
                          }
                        } else {
                          console.error("Failed to resume session: server returned", res.status);
                        }
                      } catch (e) {
                        console.error("Failed to resume session:", e);
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Resume
                  </button>
                  <button
                    onClick={handleNewSession}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 transition-colors"
                  >
                    New Session
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Panel */}
          <AnimatePresence>
            {isEditing && !terminalMaximized && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex-shrink-0 overflow-hidden border-b border-border"
              >
                <div className="p-4 space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setEditName(newName);
                        // Instant update
                        if (selectedNodeId && session) {
                          const customName = newName !== session.agentName ? newName : undefined;
                          updateSession(selectedNodeId, { customName });
                          if (node) {
                            updateNode(selectedNodeId, {
                              data: { ...node.data, label: newName },
                            });
                          }
                          // Persist to API
                          fetch(`/api/sessions/${session.sessionId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ customName }),
                          }).catch(console.error);
                        }
                      }}
                      className="mt-1 w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                    />
                  </div>
                  
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Color</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {presetColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            setEditColor(color);
                            // Instant update
                            if (selectedNodeId && session) {
                              updateSession(selectedNodeId, { customColor: color });
                              if (node) {
                                updateNode(selectedNodeId, {
                                  data: { ...node.data, color },
                                });
                              }
                              // Persist to API
                              fetch(`/api/sessions/${session.sessionId}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ customColor: color }),
                              }).catch(console.error);
                            }
                          }}
                          className={`w-7 h-7 rounded-md transition-all ${
                            editColor === color
                              ? "ring-2 ring-white ring-offset-2 ring-offset-canvas-dark scale-110"
                              : "hover:scale-110"
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Icon</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {iconOptions.map(({ id, icon: IconComponent }) => (
                        <button
                          key={id}
                          onClick={() => {
                            setEditIcon(id);
                            // Instant update
                            if (selectedNodeId && node) {
                              updateNode(selectedNodeId, {
                                data: { ...node.data, icon: id },
                              });
                            }
                            // Persist to server
                            if (session) {
                              fetch(`/api/sessions/${session.sessionId}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ icon: id }),
                              }).catch(console.error);
                            }
                          }}
                          className={`w-9 h-9 rounded-md transition-all flex items-center justify-center ${
                            editIcon === id
                              ? "ring-2 ring-white ring-offset-2 ring-offset-canvas-dark scale-110 bg-white/10"
                              : "hover:scale-110 hover:bg-white/5 bg-canvas"
                          }`}
                          style={{ borderColor: editIcon === id ? editColor : "#333", borderWidth: '1px' }}
                        >
                          <IconComponent
                            className="w-4 h-4"
                            style={{ color: editIcon === id ? editColor : "#888" }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Notes</label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => {
                        const newNotes = e.target.value;
                        setEditNotes(newNotes);
                        // Update with debounce would be better, but instant for now
                      }}
                      onBlur={() => {
                        // Save notes on blur
                        if (selectedNodeId && session) {
                          fetch(`/api/sessions/${session.sessionId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ notes: editNotes || undefined }),
                          }).catch(console.error);
                          updateSession(selectedNodeId, { notes: editNotes || undefined });
                        }
                      }}
                      placeholder="Add notes..."
                      rows={2}
                      className="mt-1 w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Terminal — pooled terminals swap DOM containers for instant switching */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 bg-[#0d0d0d]">
              <PooledTerminalMount
                terminalId={activeTerminalId}
                terminals={mountedTerminals}
              />
            </div>

          </div>

          {/* Details */}
          <div className={`flex-shrink-0 border-t border-border ${terminalMaximized ? "hidden" : ""}`}>
            <div className="p-4 space-y-2">
              {session.notes && !isEditing && (
                <p className="text-xs text-zinc-400 italic mb-3 pb-3 border-b border-border">
                  {session.notes}
                </p>
              )}
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                <span className="text-zinc-500">Started</span>
                <span className="text-zinc-400 font-mono ml-auto">
                  {new Date(session.createdAt).toLocaleTimeString()}
                </span>
              </div>
              {session.contextTokens != null && session.contextTokens > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <Zap className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                  <span className="text-zinc-500">Context</span>
                  <span className="text-zinc-400 font-mono ml-auto">
                    {Math.round(session.contextTokens / 1_000)}K tokens
                  </span>
                </div>
              )}
              {session.gitBranch && (
                <div className="flex items-center gap-2 text-xs">
                  <GitBranch className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                  <span className="text-zinc-500">Branch</span>
                  <span className="text-purple-400 font-mono ml-auto">
                    {session.gitBranch}
                  </span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* More actions dropdown menu */}
    {showMenu && !terminalMaximized && createPortal(
      <>
        <div className="fixed inset-0 z-[9998]" onClick={() => setShowMenu(false)} />
        <div
          className="fixed z-[9999] min-w-[160px] rounded-lg border shadow-xl py-1"
          style={{
            top: menuButtonRef.current
              ? menuButtonRef.current.getBoundingClientRect().bottom + 4
              : 0,
            right: menuButtonRef.current
              ? window.innerWidth - menuButtonRef.current.getBoundingClientRect().right
              : 0,
            backgroundColor: "#262626",
            borderColor: "#333",
          }}
        >
          {!isDisconnected && (
            <button
              onClick={() => { handleNewSession(); setShowMenu(false); }}
              className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              New Session
            </button>
          )}
          <button
            onClick={() => { setIsEditing(!isEditing); setShowMenu(false); }}
            className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit
          </button>
          {canFork && (
            <button
              onClick={() => { handleFork(); setShowMenu(false); }}
              className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
            >
              <GitFork className="w-3.5 h-3.5" />
              Fork
            </button>
          )}
          {showArchived ? (
            <button
              onClick={() => {
                if (selectedNodeId) {
                  unarchiveSession(selectedNodeId);
                  handleClose();
                }
                setShowMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
            >
              <Archive className="w-3.5 h-3.5" />
              Unarchive
            </button>
          ) : (
            <button
              onClick={() => {
                if (selectedNodeId) {
                  setDeleteDialogOpen(true);
                }
                setShowMenu(false);
              }}
              className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-white/5 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
      </>,
      document.body
    )}

    {session && (
      <ForkDialog
        open={forkDialogOpen}
        onClose={() => setForkDialogOpen(false)}
        parentName={session.customName || session.agentName || "Agent"}
        parentColor={session.customColor || session.color || "#22C55E"}
        parentIcon={(node?.data as any)?.icon || "sparkles"}
        parentCwd={session.cwd || ""}
        onConfirm={handleForkConfirm}
      />
    )}
    {session && (
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        sessionId={session.sessionId}
        sessionName={session.customName || session.agentName || "Agent"}
        onConfirm={async (cleanup) => {
          if (!selectedNodeId) return;
          await deleteSessionWithCleanup(selectedNodeId, session.sessionId, cleanup);
          setSelectedNodeId(null);
          setDeleteDialogOpen(false);
          handleClose();
        }}
      />
    )}
    </>
  );
}
