import { useEffect, useCallback, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  BackgroundVariant,
  ReactFlowProvider,
  NodeChange,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";

import { useStore } from "./stores/useStore";
import { AgentNode } from "./components/AgentNode/index";
import { Sidebar } from "./components/Sidebar";
import { NewSessionModal } from "./components/NewSessionModal";
import { Header } from "./components/Header";
import { CanvasControls } from "./components/CanvasControls";
import { OnboardingTour } from "./components/OnboardingTour";
import { CanvasTabs } from "./components/CanvasTabs";
import { AuthBanner } from "./components/AuthBanner";

const nodeTypes = {
  agent: AgentNode,
};

function AppContent() {
  const {
    nodes: storeNodes,
    setNodes: setStoreNodes,
    setAgents,
    setLaunchCwd,
    setSelectedNodeId,
    setSidebarOpen,
    selectedNodeId,
    sidebarOpen,
    addSession,
    updateSession,
    agents,
    addAgentModalOpen,
    setAddAgentModalOpen,
    newSessionModalOpen,
    setNewSessionModalOpen,
    newSessionForNodeId,
    setNewSessionForNodeId,
    sessions,
    showArchived,
    activeCanvasId,
    setCanvases,
    setActiveCanvasId,
  } = useStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const reactFlowInstance = useReactFlow();
  const positionUpdateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredRef = useRef(false);

  // Filter nodes to show only those belonging to the active canvas
  const activeCanvasNodes = useMemo(() => {
    if (!activeCanvasId) return nodes;
    return nodes.filter(n => n.data?.canvasId === activeCanvasId);
  }, [nodes, activeCanvasId]);

  // Sync nodes with store
  useEffect(() => {
    setStoreNodes(nodes);
  }, [nodes, setStoreNodes]);

  useEffect(() => {
    if (storeNodes.length > 0 || hasRestoredRef.current) {
      setNodes(storeNodes);
    }
  }, [storeNodes, setNodes]);

  // Fetch config, agents, and restore state on mount
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((config) => setLaunchCwd(config.launchCwd))
      .catch(console.error);

    fetch("/api/agents")
      .then((res) => res.json())
      .then((agents) => setAgents(agents))
      .catch(console.error);
  }, [setAgents, setLaunchCwd]);

  // Load canvases on mount (with migration if needed)
  useEffect(() => {
    fetch("/api/canvases")
      .then(res => res.json())
      .then(canvases => {
        if (canvases.length === 0) {
          // Trigger migration from categories to canvases
          fetch("/api/migrate/canvases", { method: "POST" })
            .then(() => fetch("/api/canvases"))
            .then(res => res.json())
            .then(migratedCanvases => {
              setCanvases(migratedCanvases);
              const savedActiveId = localStorage.getItem("openui-active-canvas");
              // Validate that saved canvas ID exists, otherwise use first canvas
              const validCanvasId = savedActiveId && migratedCanvases.find((c: any) => c.id === savedActiveId)
                ? savedActiveId
                : migratedCanvases[0]?.id;
              setActiveCanvasId(validCanvasId);
            });
        } else {
          setCanvases(canvases);
          const savedActiveId = localStorage.getItem("openui-active-canvas");
          // Validate that saved canvas ID exists, otherwise use first canvas
          const validCanvasId = savedActiveId && canvases.find((c: any) => c.id === savedActiveId)
            ? savedActiveId
            : canvases[0]?.id;
          setActiveCanvasId(validCanvasId);
        }
      })
      .catch(console.error);
  }, [setCanvases, setActiveCanvasId]);

  // Keyboard shortcuts for switching between agents
  useEffect(() => {
    const getAgentNodeIds = () => {
      return activeCanvasNodes
        .filter((n) => n.type === "agent")
        .sort((a: any, b: any) => {
          // Sort top-to-bottom, left-to-right for consistent ordering
          if (Math.abs(a.position.y - b.position.y) < 50) {
            return a.position.x - b.position.x;
          }
          return a.position.y - b.position.y;
        })
        .map((n) => n.id);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      const agentNodeIds = getAgentNodeIds();

      // Cmd/Ctrl + 1-9 for agents on current canvas
      if (isMod && e.key >= "1" && e.key <= "9" && !e.shiftKey && !e.altKey) {
        if (agentNodeIds.length > 0) {
          e.preventDefault();
          const index = parseInt(e.key) - 1;
          if (index < agentNodeIds.length) {
            setSelectedNodeId(agentNodeIds[index]);
            setSidebarOpen(true);
          }
        }
        return;
      }

      // Cmd/Ctrl + [ (prev) and ] (next) for agents
      if (isMod && (e.key === "[" || e.key === "]") && agentNodeIds.length > 0) {
        e.preventDefault();
        const currentIndex = selectedNodeId
          ? agentNodeIds.indexOf(selectedNodeId)
          : -1;
        const newIndex =
          e.key === "["
            ? currentIndex <= 0
              ? agentNodeIds.length - 1
              : currentIndex - 1
            : currentIndex >= agentNodeIds.length - 1
              ? 0
              : currentIndex + 1;
        setSelectedNodeId(agentNodeIds[newIndex]);
        setSidebarOpen(true);
        return;
      }

      // Escape to close sidebar
      if (e.key === "Escape" && sidebarOpen) {
        e.preventDefault();
        setSidebarOpen(false);
        setSelectedNodeId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCanvasNodes, selectedNodeId, sidebarOpen, setSelectedNodeId, setSidebarOpen]);

  // Keyboard shortcuts for canvas switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K: Open conversation search (works even from inputs)
      if (isMod && e.key === "k") {
        e.preventDefault();
        // Toggle the search modal via a custom event
        window.dispatchEvent(new CustomEvent("openui:toggle-search"));
        return;
      }

      // Skip if typing in input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Get fresh state on each keypress to avoid stale closures
      const { canvases, addCanvas } = useStore.getState();

      // Cmd/Ctrl + Shift + 1-9: Switch to canvas by index
      if (isMod && e.shiftKey && !e.altKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < canvases.length) {
          setActiveCanvasId(canvases[index].id);
        }
        return;
      }

      // Cmd/Ctrl + Shift + T: New canvas
      if (isMod && e.shiftKey && e.key === "t") {
        e.preventDefault();
        const newCanvas = {
          id: `canvas-${Date.now()}`,
          name: `Canvas ${canvases.length + 1}`,
          color: "#3B82F6",
          order: canvases.length,
          createdAt: new Date().toISOString(),
        };

        fetch("/api/canvases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newCanvas),
        }).then(() => {
          addCanvas(newCanvas);
          setActiveCanvasId(newCanvas.id);
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveCanvasId]);

  // Poll for status updates every second to catch any missed WebSocket messages
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch("/api/sessions");
        if (res.ok) {
          const sessionsData = await res.json();
          const currentSessions = useStore.getState().sessions;
          for (const sessionData of sessionsData) {
            if (sessionData.nodeId && sessionData.status) {
              const existing = currentSessions.get(sessionData.nodeId);
              if (existing) {
                const updates: Record<string, any> = {};
                if (existing.status !== sessionData.status) {
                  updates.status = sessionData.status;
                }
                if ((existing.longRunningTool || false) !== (sessionData.longRunningTool || false)) {
                  updates.longRunningTool = sessionData.longRunningTool || false;
                }
                if (sessionData.tokens != null && existing.tokens !== sessionData.tokens) {
                  updates.tokens = sessionData.tokens;
                }
                if (Object.keys(updates).length > 0) {
                  updateSession(sessionData.nodeId, updates);
                }
              }
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    };

    // Poll immediately and then every second
    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => clearInterval(interval);
  }, [updateSession]);

  // Poll auto-resume progress during startup
  useEffect(() => {
    const { setAutoResumeProgress } = useStore.getState();
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/auto-resume/progress");
        if (res.ok) {
          const progress = await res.json();
          setAutoResumeProgress(progress);
          // Stop polling once queue is inactive and we've seen at least one update
          if (!progress.isActive && progress.total > 0) {
            // Keep showing for 2s after completion then clear
            setTimeout(() => {
              if (!stopped) setAutoResumeProgress(null);
            }, 2000);
            return; // Don't schedule another poll
          }
          if (!progress.isActive && progress.total === 0) {
            setAutoResumeProgress(null);
            return; // No auto-resume happening
          }
        }
      } catch {
        // Ignore errors
      }
      if (!stopped) setTimeout(poll, 1500);
    };

    poll();
    return () => { stopped = true; };
  }, []);

  // Restore sessions after agents are loaded
  useEffect(() => {
    if (agents.length === 0 || hasRestoredRef.current) return;

    Promise.all([
      fetch("/api/sessions").then((res) => res.json()),
      fetch("/api/state").then((res) => res.json()),
    ])
      .then(([sessions, { nodes: savedNodes }]) => {
        const restoredNodes: any[] = [];

        // Restore agent sessions
        sessions.forEach((session: any, index: number) => {
          const saved = savedNodes?.find((n: any) => n.sessionId === session.sessionId);
          const agent = agents.find((a) => a.id === session.agentId);
          const position = saved?.position?.x
            ? saved.position
            : {
                x: 100 + (index % 5) * 220,
                y: 100 + Math.floor(index / 5) * 150,
              };

          addSession(session.nodeId, {
            id: session.nodeId,
            sessionId: session.sessionId,
            agentId: session.agentId,
            agentName: session.agentName,
            command: session.command,
            color: session.customColor || agent?.color || "#888",
            createdAt: session.createdAt,
            cwd: session.cwd,
            gitBranch: session.gitBranch,
            status: session.status || "idle",
            customName: session.customName,
            customColor: session.customColor,
            notes: session.notes,
            isRestored: session.isRestored,
            ticketId: session.ticketId,
            ticketTitle: session.ticketTitle,
          });

          restoredNodes.push({
            id: session.nodeId,
            type: "agent",
            position,
            data: {
              label: session.customName || session.agentName,
              agentId: session.agentId,
              color: session.customColor || agent?.color || "#888",
              icon: agent?.icon || "cpu",
              sessionId: session.sessionId,
              canvasId: saved?.canvasId || activeCanvasId,
            },
          });
        });

        hasRestoredRef.current = true;
        setNodes(restoredNodes);
        setStoreNodes(restoredNodes);
      })
      .catch(console.error);
  }, [agents, addSession, setNodes, setStoreNodes, activeCanvasId]);

  // Reload sessions when archive toggle changes
  useEffect(() => {
    if (!hasRestoredRef.current) return; // Skip on initial load

    const archivedParam = showArchived ? "?archived=true" : "";
    Promise.all([
      fetch(`/api/sessions${archivedParam}`).then((res) => res.json()),
      fetch(`/api/state${archivedParam}`).then((res) => res.json()),
    ])
      .then(([sessions, { nodes: savedNodes }]) => {
        const updatedNodes: any[] = [];

        // Update agent sessions
        sessions.forEach((session: any, index: number) => {
          const saved = savedNodes?.find((n: any) => n.sessionId === session.sessionId);
          const agent = agents.find((a) => a.id === session.agentId);
          const position = saved?.position?.x
            ? saved.position
            : {
                x: 100 + (index % 5) * 220,
                y: 100 + Math.floor(index / 5) * 150,
              };

          updatedNodes.push({
            id: session.nodeId,
            type: "agent",
            position,
            data: {
              agentName: session.agentName,
              customName: session.customName,
              color: session.customColor || agent?.color || "#888",
              status: session.status,
              cwd: session.cwd,
              gitBranch: session.gitBranch,
              isRestored: session.isRestored,
              ticketId: session.ticketId,
              ticketTitle: session.ticketTitle,
              icon: agent?.icon || "cpu",
              sessionId: session.sessionId,
              canvasId: saved?.canvasId || activeCanvasId,
            },
          });

          addSession(session.nodeId, {
            id: session.nodeId,
            sessionId: session.sessionId,
            agentId: session.agentId,
            agentName: session.agentName,
            command: session.command,
            color: session.customColor || agent?.color || "#888",
            createdAt: session.createdAt,
            cwd: session.cwd,
            gitBranch: session.gitBranch,
            status: session.status,
            customName: session.customName,
            customColor: session.customColor,
            notes: session.notes,
            isRestored: session.isRestored,
            ticketId: session.ticketId,
            ticketTitle: session.ticketTitle,
          });
        });

        setNodes(updatedNodes);
        setStoreNodes(updatedNodes);

        // Auto-center viewport after nodes are updated
        setTimeout(() => {
          if (updatedNodes.length > 0) {
            reactFlowInstance.fitView({
              padding: 0.2,      // 20% breathing room
              duration: 300,     // Smooth 300ms transition
              nodes: updatedNodes
            });
          }
        }, 50); // Wait for ReactFlow to process new nodes
      })
      .catch(console.error);
  }, [showArchived, agents, addSession, setNodes, setStoreNodes, activeCanvasId, reactFlowInstance]);

  // Helper to save all positions - accepts nodes directly to avoid sync issues
  const saveAllPositions = useCallback((nodesToSave?: typeof nodes) => {
    const currentNodes = nodesToSave || useStore.getState().nodes;
    if (currentNodes.length === 0) return;

    const positions: Record<string, { x: number; y: number; canvasId?: string }> = {};
    const GRID_SIZE = 24;
    currentNodes.forEach((node: any) => {
      // Only save agent positions
      if (node.type === "agent") {
        positions[node.id] = {
          x: Math.round(node.position.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(node.position.y / GRID_SIZE) * GRID_SIZE,
          canvasId: node.data?.canvasId,
        };
      }
    });
    if (Object.keys(positions).length > 0) {
      fetch("/api/state/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      }).catch(console.error);
    }
  }, [nodes]);

  // Save positions on window close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveAllPositions();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveAllPositions]);

  // Save positions when nodes are moved

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Apply changes
    onNodesChange(changes);

    // Debounced save for position changes only
    const positionChanges = changes.filter(
      c => c.type === "position" && "dragging" in c && !c.dragging
    );

    if (positionChanges.length > 0) {
      if (positionUpdateTimeout.current) {
        clearTimeout(positionUpdateTimeout.current);
      }
      positionUpdateTimeout.current = setTimeout(() => {
        saveAllPositions();
      }, 300);
    }
  }, [onNodesChange, saveAllPositions]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      // Only open sidebar for agent nodes
      if (node.type === "agent") {
        setSelectedNodeId(node.id);
        setSidebarOpen(true);
      }
    },
    [setSelectedNodeId, setSidebarOpen]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSidebarOpen(false);
  }, [setSelectedNodeId, setSidebarOpen]);

  const isEmpty = nodes.length === 0;

  return (
    <div className="w-screen h-screen bg-canvas overflow-hidden flex flex-col">
      <Header />
      <AuthBanner />
      <CanvasTabs />

      <div data-tour="canvas-area" className="flex-1 relative">
        <ReactFlow
          nodes={activeCanvasNodes}
          edges={[]}
          onNodesChange={handleNodesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
          nodesDraggable
          nodesConnectable={false}
          snapToGrid
          snapGrid={[24, 24]}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="#252525"
          />
          <Controls
            showInteractive={false}
            position="bottom-left"
          />
          <CanvasControls />
        </ReactFlow>

        {/* Empty state */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center pointer-events-auto">
              <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-zinc-600" />
              </div>
              <h2 className="text-lg font-medium text-zinc-300 mb-2">No agents yet</h2>
              <p className="text-sm text-zinc-500 mb-4 max-w-xs">
                Spawn your first AI agent to get started
              </p>
              <button
                onClick={() => setAddAgentModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-white text-canvas font-medium text-sm hover:bg-zinc-100 transition-colors"
              >
                Create Agent
              </button>
            </div>
          </div>
        )}

        <Sidebar />
      </div>

      <NewSessionModal
        open={addAgentModalOpen || newSessionModalOpen}
        onClose={() => {
          setAddAgentModalOpen(false);
          setNewSessionModalOpen(false);
          setNewSessionForNodeId(null);
        }}
        existingSession={newSessionForNodeId ? sessions.get(newSessionForNodeId) : undefined}
        existingNodeId={newSessionForNodeId || undefined}
      />

      {sessions.size === 0 && <OnboardingTour />}
    </div>
  );
}

function App() {
  return (
    <ReactFlowProvider>
      <AppContent />
    </ReactFlowProvider>
  );
}

export default App;
