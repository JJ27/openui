import { useState, useEffect } from "react";
import { useStore, AgentSession } from "../../stores/useStore";
import type { ForkDialogResult } from "../ForkDialog";
import { deleteSessionWithCleanup } from "../../utils/deleteSession";

interface AgentNodeData {
  sessionId: string;
  agentId?: string;
  color?: string;
  icon?: string;
}

export function useAgentNodeState(
  id: string,
  nodeData: AgentNodeData,
  session: AgentSession | undefined
) {
  const { setSelectedNodeId, setSidebarOpen, addNode, addSession, archiveSession, shellTabs: shellTabsMap, deleteShellTabs } =
    useStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".context-menu-container")) {
        return;
      }
      setContextMenu(null);
    };
    if (contextMenu) {
      setTimeout(() => {
        window.addEventListener("click", handleClick);
      }, 0);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDelete = () => {
    setDeleteDialogOpen(true);
    setContextMenu(null);
  };

  const handleDeleteConfirm = async (cleanup: {
    deleteLocalBranch: boolean;
    deleteRemoteBranch: boolean;
  }) => {
    const sessionId = session?.sessionId || nodeData.sessionId;
    if (!sessionId) return;

    await deleteSessionWithCleanup(id, sessionId, cleanup);
    setSelectedNodeId(null);
    setDeleteDialogOpen(false);
    setSidebarOpen(false);
  };

  const handleArchive = async () => {
    setContextMenu(null);

    // Clean up shell tabs
    const nodeTabs = shellTabsMap.get(id);
    if (nodeTabs) {
      for (const tab of nodeTabs) {
        fetch(`/api/shell/${tab.shellId}`, { method: "DELETE" }).catch(() => {});
      }
      deleteShellTabs(id);
    }

    await archiveSession(id);
    setSidebarOpen(false);
  };

  const handleFork = () => {
    setForkDialogOpen(true);
    setContextMenu(null);
  };

  const handleForkConfirm = async (opts: ForkDialogResult) => {
    const sessionId = session?.sessionId || nodeData.sessionId;
    if (!sessionId) return;

    const parentNode = useStore.getState().nodes.find(n => n.id === id);
    const parentPos = parentNode?.position || { x: 0, y: 0 };
    const forkPos = { x: parentPos.x + 250, y: parentPos.y + 60 };
    const activeCanvasId = useStore.getState().activeCanvasId;

    const res = await fetch(`/api/sessions/${sessionId}/fork`, {
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

    addNode({
      id: data.nodeId,
      type: "agent",
      position: forkPos,
      data: {
        label: data.customName || opts.name || "Fork",
        agentId: data.agentId || session?.agentId || "claude",
        color: data.customColor || opts.color || session?.color || "#22C55E",
        icon: opts.icon || nodeData.icon || "sparkles",
        sessionId: data.sessionId,
        canvasId: activeCanvasId,
      },
    });

    addSession(data.nodeId, {
      id: data.nodeId,
      sessionId: data.sessionId,
      agentId: data.agentId || session?.agentId || "claude",
      agentName: data.agentName || session?.agentName || "Claude Code",
      command: session?.command || "claude",
      color: data.customColor || opts.color || session?.color || "#22C55E",
      createdAt: new Date().toISOString(),
      cwd: data.cwd || session?.cwd || "",
      gitBranch: data.gitBranch,
      status: "running",
      customName: data.customName,
      customColor: data.customColor,
    });

    setSelectedNodeId(data.nodeId);
    setSidebarOpen(true);
    setForkDialogOpen(false);
  };

  const canFork = session?.agentId === "claude";

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  return {
    contextMenu,
    handleContextMenu,
    handleDelete,
    handleDeleteConfirm,
    handleFork,
    handleForkConfirm,
    handleArchive,
    canFork,
    closeContextMenu,
    forkDialogOpen,
    setForkDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
  };
}
