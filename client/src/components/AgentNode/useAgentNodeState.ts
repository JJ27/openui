import { useState, useEffect } from "react";
import { useStore, AgentStatus, AgentSession } from "../../stores/useStore";

interface AgentNodeData {
  sessionId: string;
}

// Shared polling state to prevent multiple nodes from polling simultaneously
let globalPollingActive = false;
let globalPollInterval: ReturnType<typeof setInterval> | null = null;
let subscribedNodes = new Set<string>();

export function useAgentNodeState(
  id: string,
  nodeData: AgentNodeData,
  session: AgentSession | undefined
) {
  const { removeNode, removeSession, setSelectedNodeId, setSidebarOpen } =
    useStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<AgentStatus>(session?.status || "idle");

  // Subscribe to global polling
  useEffect(() => {
    const sessionId = session?.sessionId || nodeData.sessionId;
    if (!sessionId) return;

    subscribedNodes.add(id);

    // Start global polling if not already active
    if (!globalPollingActive) {
      globalPollingActive = true;

      const pollAllSessions = async () => {
        if (subscribedNodes.size === 0) return;

        try {
          const res = await fetch(`/api/sessions`);
          if (res.ok) {
            const sessionsData = await res.json();
            // Update each subscribed node with its data
            const { updateSession: storeUpdateSession, sessions: currentSessions } = useStore.getState();
            for (const [nodeId, nodeSession] of Object.entries(currentSessions) as [string, AgentSession][]) {
              if (!subscribedNodes.has(nodeId)) continue;
              const sessionData = sessionsData.find((s: any) => s.sessionId === nodeSession.sessionId);
              if (sessionData) {
                storeUpdateSession(nodeId, {
                  status: sessionData.status,
                  isRestored: sessionData.isRestored,
                  metrics: sessionData.metrics,
                  gitBranch: sessionData.gitBranch,
                  ticketId: sessionData.ticketId,
                  ticketTitle: sessionData.ticketTitle,
                });
              }
            }
          }
        } catch (e) {}
      };

      pollAllSessions();
      globalPollInterval = setInterval(pollAllSessions, 3000); // Increased from 2s to 3s
    }

    return () => {
      subscribedNodes.delete(id);
      // Stop global polling if no more subscribers
      if (subscribedNodes.size === 0 && globalPollInterval) {
        clearInterval(globalPollInterval);
        globalPollInterval = null;
        globalPollingActive = false;
      }
    };
  }, [session?.sessionId, nodeData.sessionId, id]);

  useEffect(() => {
    if (session?.status) {
      setStatus(session.status);
    }
  }, [session?.status]);

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

  const handleDelete = async () => {
    const sessionId = session?.sessionId || nodeData.sessionId;
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    }
    removeSession(id);
    removeNode(id);
    setSelectedNodeId(null);
    setSidebarOpen(false);
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  return {
    contextMenu,
    status,
    handleContextMenu,
    handleDelete,
    closeContextMenu,
  };
}
