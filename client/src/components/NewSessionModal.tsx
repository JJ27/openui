import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  Code,
  Cpu,
  FolderOpen,
  Terminal,
  Plus,
  Minus,
  Loader2,
  GitBranch,
  AlertCircle,
  AlertTriangle,
  Home,
  ArrowUp,
  Github,
  Brain,
  History,
  ChevronDown,
} from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useStore, Agent, AgentSession } from "../stores/useStore";

const iconMap: Record<string, any> = {
  sparkles: Sparkles,
  code: Code,
  cpu: Cpu,
  brain: Brain,
};

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  url: string;
  state: string;
  labels: { name: string; color: string }[];
  assignee?: { login: string };
}

interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
  // If provided, we're replacing an existing session on this node
  existingSession?: AgentSession;
  existingNodeId?: string;
}

interface ClaudeConversation {
  sessionId: string;
  slug: string;
  summary: string;
  firstPrompt: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  matchSnippet?: string;
  fileExists: boolean;
}

type TabType = "blank" | "github" | "resume";

// Node dimensions for collision detection
const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;
const SPACING = 24; // Grid snap size

// Find a free position near the target that doesn't overlap existing nodes
function findFreePosition(
  targetX: number,
  targetY: number,
  existingNodes: { position?: { x: number; y: number } }[],
  count: number = 1
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const GRID = SPACING;

  // Snap target to grid
  const startX = Math.round(targetX / GRID) * GRID;
  const startY = Math.round(targetY / GRID) * GRID;

  // Filter to only nodes with valid positions
  const validNodes = existingNodes.filter(
    (n): n is { position: { x: number; y: number } } =>
      n.position !== undefined &&
      typeof n.position.x === 'number' &&
      typeof n.position.y === 'number'
  );

  // Check if a position overlaps with any existing node or already-placed new node
  const isOverlapping = (x: number, y: number, placedPositions: { x: number; y: number }[]) => {
    const allPositions = [...validNodes.map(n => n.position), ...placedPositions];
    for (const pos of allPositions) {
      const overlapX = Math.abs(x - pos.x) < NODE_WIDTH + SPACING;
      const overlapY = Math.abs(y - pos.y) < NODE_HEIGHT + SPACING;
      if (overlapX && overlapY) return true;
    }
    return false;
  };

  // Spiral outward from target position to find free spots
  for (let i = 0; i < count; i++) {
    let found = false;
    let radius = 0;
    const maxRadius = 20; // Max search radius in grid units

    while (!found && radius <= maxRadius) {
      // Try positions in a spiral pattern
      for (let dx = -radius; dx <= radius && !found; dx++) {
        for (let dy = -radius; dy <= radius && !found; dy++) {
          // Only check positions on the current ring
          if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;

          const x = startX + dx * (NODE_WIDTH + SPACING);
          const y = startY + dy * (NODE_HEIGHT + SPACING);

          if (!isOverlapping(x, y, positions)) {
            positions.push({ x, y });
            found = true;
          }
        }
      }
      radius++;
    }

    // Fallback if no free position found
    if (!found) {
      positions.push({
        x: startX + i * (NODE_WIDTH + SPACING),
        y: startY,
      });
    }
  }

  return positions;
}

export function NewSessionModal({
  open,
  onClose,
  existingSession,
  existingNodeId,
}: NewSessionModalProps) {
  const {
    agents,
    addNode,
    addSession,
    updateSession,
    nodes,
    sessions,
    launchCwd,
    activeCanvasId,
    pendingResumeConversation,
    setPendingResumeConversation,
  } = useStore();

  // Get ReactFlow instance to access viewport
  const reactFlowInstance = useReactFlow();

  const isReplacing = !!existingSession;

  // Form state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [cwd, setCwd] = useState("");
  const [customName, setCustomName] = useState("");
  const [commandArgs, setCommandArgs] = useState("");
  const [count, setCount] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("blank");

  // Git branch state
  const [branchName, setBranchName] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [showBranchOptions, setShowBranchOptions] = useState(false);
  const defaultBaseBranchRef = useRef("main");
  const [branchMode, setBranchMode] = useState<"branch" | "pr">("branch");
  const [prNumber, setPrNumber] = useState("");
  // Directory picker state
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [dirBrowsePath, setDirBrowsePath] = useState("");
  const [dirBrowseParent, setDirBrowseParent] = useState<string | null>(null);
  const [dirBrowseDirs, setDirBrowseDirs] = useState<{ name: string; path: string }[]>([]);
  const [dirBrowseLoading, setDirBrowseLoading] = useState(false);
  const [dirBrowseError, setDirBrowseError] = useState<string | null>(null);

  // GitHub state
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [githubIssues, setGithubIssues] = useState<GitHubIssue[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [selectedGithubIssue, setSelectedGithubIssue] = useState<GitHubIssue | null>(null);

  // Resume/conversation search state
  const [resumeQuery, setResumeQuery] = useState("");
  const [resumeConversations, setResumeConversations] = useState<ClaudeConversation[]>([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<ClaudeConversation | null>(null);
  const [resumeProjects, setResumeProjects] = useState<{ dirName: string; originalPath: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState("");

  // Track if we've initialized for this modal open
  const [initialized, setInitialized] = useState(false);

  // Conflict warning: count other active agents sharing the same cwd (excluding the session being replaced)
  const effectiveCwd = cwd || (isReplacing ? existingSession?.cwd : null) || launchCwd;
  const conflictingAgentCount = !branchName && !prNumber
    ? Array.from(sessions.values()).filter(
        (s) =>
          s.cwd === effectiveCwd &&
          !s.archived &&
          s.status !== "disconnected" &&
          (!isReplacing || s.id !== existingNodeId)
      ).length
    : 0;

  // Reset form when modal opens (only once per open)
  useEffect(() => {
    if (open && !initialized) {
      // Fetch default base branch from settings
      fetch("/api/settings")
        .then((res) => res.json())
        .then((config) => {
          const base = config.defaultBaseBranch || "main";
          defaultBaseBranchRef.current = base;
          setBaseBranch(base);
        })
        .catch(() => {});

      if (existingSession) {
        // Pre-fill from existing session
        const agent = agents.find((a) => a.id === existingSession.agentId);
        setSelectedAgent(agent || null);
        setCwd(existingSession.cwd);
        setCustomName(existingSession.customName || "");
        setCommandArgs("");
        setCount(1);
      } else {
        setSelectedAgent(null);
        setCwd("");
        setCustomName("");
        setCommandArgs("");
        setCount(1);
      }
      setActiveTab("blank");
      // Reset branch/worktree state
      setBranchName("");
      setBaseBranch(defaultBaseBranchRef.current);
      setShowBranchOptions(false);
      setBranchMode("branch");
      setPrNumber("");
      // Reset GitHub state
      setSelectedGithubIssue(null);
      setGithubIssues([]);
      setGithubError(null);
      // Reset resume state
      setSelectedConversation(null);
      setResumeConversations([]);
      setResumeError(null);
      setResumeQuery("");
      setInitialized(true);

      // Handle pending resume from conversation search modal
      if (pendingResumeConversation) {
        setActiveTab("resume");
        setSelectedConversation(pendingResumeConversation);
        // Auto-select Claude agent
        const claudeAgent = agents.find((a) => a.id === "claude");
        if (claudeAgent) setSelectedAgent(claudeAgent);
        // Auto-set working directory
        if (pendingResumeConversation.projectPath) setCwd(pendingResumeConversation.projectPath);
        setPendingResumeConversation(null);
        // Load projects for the Resume tab
        loadResumeProjects();
      }
    } else if (!open) {
      // Reset flags when modal closes
      setInitialized(false);
    }
  }, [open, initialized, existingSession, agents]);

  // Generate branch name from GitHub issue
  useEffect(() => {
    if (selectedGithubIssue) {
      const slug = selectedGithubIssue.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      setBranchName(`issue-${selectedGithubIssue.number}/${slug}`);
    }
  }, [selectedGithubIssue]);

  // Directory browsing
  const browsePath = async (path?: string) => {
    setDirBrowseLoading(true);
    setDirBrowseError(null);
    try {
      const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : "/api/browse";
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        setDirBrowseError(data.error);
      } else {
        setDirBrowsePath(data.current);
        setDirBrowseParent(data.parent);
        setDirBrowseDirs(data.directories);
      }
    } catch (e: any) {
      setDirBrowseError(e.message);
    } finally {
      setDirBrowseLoading(false);
    }
  };

  const openDirPicker = () => {
    setShowDirPicker(true);
    browsePath(cwd || launchCwd);
  };

  const selectDirectory = (path: string) => {
    setCwd(path);
    setShowDirPicker(false);
  };

  // GitHub functions
  const loadGithubIssues = async (repoUrl: string) => {
    if (!repoUrl.trim()) return;
    setGithubLoading(true);
    setGithubError(null);
    try {
      const res = await fetch(`/api/github/issues?repoUrl=${encodeURIComponent(repoUrl)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load issues");
      }
      const data = await res.json();
      setGithubIssues(data);
    } catch (e: any) {
      setGithubError(e.message);
    } finally {
      setGithubLoading(false);
    }
  };

  const handleGithubRepoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadGithubIssues(githubRepoUrl);
  };

  // Resume conversation search functions
  const loadResumeProjects = async () => {
    try {
      const res = await fetch("/api/claude/projects");
      if (res.ok) {
        const data = await res.json();
        setResumeProjects(data);
      }
    } catch {
      // Silently fail, projects filter is optional
    }
  };

  const searchResumeConversations = async (query: string, project?: string) => {
    setResumeLoading(true);
    setResumeError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const proj = project ?? selectedProject;
      if (proj) params.set("projectPath", proj);
      params.set("limit", "30");

      const res = await fetch(`/api/claude/conversations?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to search conversations");
      }
      const data = await res.json();
      setResumeConversations(data.conversations || []);
    } catch (e: any) {
      setResumeError(e.message);
    } finally {
      setResumeLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const handleCreate = async () => {
    if (!selectedAgent) return;

    setIsCreating(true);

    try {
      const workingDir = cwd || (isReplacing ? existingSession?.cwd : null) || launchCwd;

      // If resuming a conversation, inject --resume flag
      let effectiveCommandArgs = commandArgs;
      if (activeTab === "resume" && selectedConversation) {
        effectiveCommandArgs = `--resume ${selectedConversation.sessionId}`;
      }

      const fullCommand = selectedAgent.command
        ? (effectiveCommandArgs ? `${selectedAgent.command} ${effectiveCommandArgs}` : selectedAgent.command)
        : effectiveCommandArgs;

      // If replacing existing session, delete it first
      if (isReplacing && existingSession && existingNodeId) {
        await fetch(`/api/sessions/${existingSession.sessionId}`, { method: "DELETE" });

        // Create the replacement session
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            command: fullCommand,
            cwd: workingDir,
            nodeId: existingNodeId,
            customName: customName || existingSession.customName,
            customColor: existingSession.customColor,
            // Ticket info (GitHub tab)
            ...(selectedGithubIssue && {
              ticketId: `#${selectedGithubIssue.number}`,
              ticketTitle: selectedGithubIssue.title,
              ticketUrl: selectedGithubIssue.url,
            }),
            // Worktree info (both GitHub and Blank tabs)
            ...(branchName && {
              branchName,
              baseBranch,
            }),
            ...(prNumber && { prNumber }),
          }),
        });

        if (res.ok) {
          const { sessionId: newSessionId, gitBranch, cwd: newCwd } = await res.json();
          updateSession(existingNodeId, {
            sessionId: newSessionId,
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            command: fullCommand,
            cwd: newCwd || workingDir,
            status: "idle",
            isRestored: false,
            ticketId: selectedGithubIssue ? `#${selectedGithubIssue.number}` : undefined,
            ticketTitle: selectedGithubIssue?.title,
            gitBranch: gitBranch || branchName || undefined,
          });
        }
      } else {
        // Creating new agent(s)
        // Get the center of the current viewport
        const viewport = reactFlowInstance.getViewport();
        const viewportBounds = document.querySelector('.react-flow')?.getBoundingClientRect();
        const viewportWidth = viewportBounds?.width || window.innerWidth;
        const viewportHeight = viewportBounds?.height || window.innerHeight;

        // Convert viewport center to flow coordinates
        const centerX = (-viewport.x + viewportWidth / 2) / viewport.zoom;
        const centerY = (-viewport.y + viewportHeight / 2) / viewport.zoom;

        // Find free positions near viewport center for all new agents
        const freePositions = findFreePosition(centerX, centerY, nodes, count);

        for (let i = 0; i < count; i++) {
          const nodeId = `node-${Date.now()}-${i}`;
          const agentName = count > 1
            ? `${customName || selectedAgent.name} ${i + 1}`
            : customName || selectedAgent.name;

          const res = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: selectedAgent.id,
              agentName: selectedAgent.name,
              command: fullCommand,
              cwd: workingDir,
              nodeId,
              customName: count > 1 ? agentName : customName || undefined,
              // Ticket info (GitHub tab, first agent only)
              ...(i === 0 && selectedGithubIssue && {
                ticketId: `#${selectedGithubIssue.number}`,
                ticketTitle: selectedGithubIssue.title,
                ticketUrl: selectedGithubIssue.url,
              }),
              // Worktree info (both GitHub and Blank tabs, first agent only)
              ...(i === 0 && branchName && {
                branchName,
                baseBranch,
              }),
              ...(i === 0 && prNumber && { prNumber }),
            }),
          });

          const { sessionId, gitBranch, cwd: newCwd } = await res.json();

          const { x, y } = freePositions[i];

          addNode({
            id: nodeId,
            type: "agent",
            position: { x, y },
            data: {
              label: agentName,
              agentId: selectedAgent.id,
              color: selectedAgent.color,
              icon: selectedAgent.icon,
              sessionId,
              canvasId: activeCanvasId,
            },
          });

          addSession(nodeId, {
            id: nodeId,
            sessionId,
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            command: fullCommand,
            color: selectedAgent.color,
            createdAt: new Date().toISOString(),
            cwd: newCwd || workingDir,
            gitBranch: gitBranch || branchName || undefined,
            status: "idle",
            customName: count > 1 ? agentName : customName || undefined,
            ticketId: i === 0 ? (selectedGithubIssue ? `#${selectedGithubIssue.number}` : undefined) : undefined,
            ticketTitle: i === 0 ? selectedGithubIssue?.title : undefined,
          });
        }
      }

      handleClose();
    } catch (error) {
      console.error("Failed to create session:", error);
    } finally {
      setIsCreating(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-lg mx-4">
              <div className="rounded-xl bg-surface border border-border shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                  <h2 className="text-base font-semibold text-white">
                    {isReplacing ? "New Session" : "New Agent"}
                  </h2>
                  <button
                    onClick={handleClose}
                    className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="px-5 pt-4 flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setActiveTab("blank");
                      setSelectedGithubIssue(null);
                      setBranchName("");
                      setBaseBranch(defaultBaseBranchRef.current);
                      setShowBranchOptions(false);
                      setBranchMode("branch");
                      setPrNumber("");
                    }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      activeTab === "blank"
                        ? "bg-white text-canvas"
                        : "text-zinc-400 hover:text-white hover:bg-surface-active"
                    }`}
                  >
                    Blank
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("github");
                      setBranchName("");
                      setBaseBranch(defaultBaseBranchRef.current);
                      setShowBranchOptions(false);
                    }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      activeTab === "github"
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-400 hover:text-white hover:bg-surface-active"
                    }`}
                  >
                    <Github className="w-3.5 h-3.5" />
                    GitHub
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("resume");
                      setSelectedGithubIssue(null);
                      setBranchName("");
                      setShowBranchOptions(false);
                      // Load projects and recent conversations on first open
                      if (resumeProjects.length === 0) loadResumeProjects();
                      if (resumeConversations.length === 0) searchResumeConversations("");
                    }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      activeTab === "resume"
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-400 hover:text-white hover:bg-surface-active"
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    Resume
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Agent selection (only for new agents) */}
                  {!isReplacing && (
                    <div className="space-y-2">
                      <label className="text-xs text-zinc-500">Select Agent</label>
                      <div className="grid grid-cols-2 gap-2">
                        {agents.map((agent) => {
                          const Icon = iconMap[agent.icon] || Cpu;
                          const isSelected = selectedAgent?.id === agent.id;
                          return (
                            <button
                              key={agent.id}
                              onClick={() => setSelectedAgent(agent)}
                              className={`relative p-3 rounded-md text-left transition-all border ${
                                isSelected
                                  ? "border-white/20 bg-surface-active"
                                  : "border-border hover:border-border hover:bg-surface-hover"
                              }`}
                            >
                              <div
                                className="w-8 h-8 rounded-md flex items-center justify-center mb-2"
                                style={{ backgroundColor: `${agent.color}20` }}
                              >
                                <Icon className="w-4 h-4" style={{ color: agent.color }} />
                              </div>
                              <h3 className="text-sm font-medium text-white">{agent.name}</h3>
                              <p className="text-[10px] text-zinc-500 mt-0.5">{agent.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* GitHub issue selection */}
                  {activeTab === "github" && (
                    <div className="space-y-3">
                      {!selectedGithubIssue ? (
                        <>
                          {/* Repo URL input */}
                          <form onSubmit={handleGithubRepoSubmit}>
                            <div className="space-y-2">
                              <label className="text-xs text-zinc-500">GitHub Repository URL</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={githubRepoUrl}
                                  onChange={(e) => setGithubRepoUrl(e.target.value)}
                                  placeholder="https://github.com/owner/repo"
                                  className="flex-1 px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                                />
                                <button
                                  type="submit"
                                  disabled={!githubRepoUrl.trim() || githubLoading}
                                  className="px-3 py-2 rounded-md bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {githubLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load"}
                                </button>
                              </div>
                            </div>
                          </form>

                          {/* Issue list */}
                          {(githubIssues.length > 0 || githubError) && (
                            <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                              {githubLoading ? (
                                <div className="p-6 text-center">
                                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin mx-auto" />
                                </div>
                              ) : githubError ? (
                                <div className="p-4 text-center">
                                  <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
                                  <p className="text-xs text-red-400">{githubError}</p>
                                </div>
                              ) : githubIssues.length === 0 ? (
                                <div className="p-6 text-center text-zinc-500 text-sm">
                                  No open issues found
                                </div>
                              ) : (
                                githubIssues.map((issue) => (
                                  <button
                                    key={issue.id}
                                    onClick={() => setSelectedGithubIssue(issue)}
                                    className="w-full p-3 hover:bg-canvas text-left transition-colors flex items-start gap-2 border-b border-border last:border-b-0"
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-green-500" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[10px] font-mono text-zinc-400">
                                          #{issue.number}
                                        </span>
                                        {issue.labels.slice(0, 2).map((label) => (
                                          <span
                                            key={label.name}
                                            className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                            style={{
                                              backgroundColor: `#${label.color}20`,
                                              color: `#${label.color}`,
                                            }}
                                          >
                                            {label.name}
                                          </span>
                                        ))}
                                      </div>
                                      <p className="text-xs text-white truncate">{issue.title}</p>
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Selected issue */}
                          <div className="p-3 rounded-lg bg-zinc-700/30 border border-zinc-600/30">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-mono font-semibold text-zinc-300">
                                #{selectedGithubIssue.number}
                              </span>
                              <button
                                onClick={() => setSelectedGithubIssue(null)}
                                className="text-[10px] text-zinc-500 hover:text-white"
                              >
                                Change
                              </button>
                            </div>
                            <p className="text-sm text-white">{selectedGithubIssue.title}</p>
                          </div>

                          {/* Branch options */}
                          <div>
                            <label className="text-xs text-zinc-500 flex items-center gap-1 mb-1.5">
                              <GitBranch className="w-3 h-3" />
                              Branch name
                            </label>
                            <input
                              type="text"
                              value={branchName}
                              onChange={(e) => setBranchName(e.target.value)}
                              className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                            />
                          </div>

                          <div>
                            <label className="text-xs text-zinc-500 mb-1.5 block">Base branch</label>
                            <input
                              type="text"
                              value={baseBranch}
                              onChange={(e) => setBaseBranch(e.target.value)}
                              placeholder="main"
                              className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                            />
                          </div>

                        </>
                      )}
                    </div>
                  )}

                  {/* Resume conversation search */}
                  {activeTab === "resume" && (
                    <div className="space-y-3">
                      {!selectedConversation ? (
                        <>
                          {/* Search input */}
                          <div className="space-y-2">
                            <label className="text-xs text-zinc-500">Search Conversations</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={resumeQuery}
                                onChange={(e) => setResumeQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") searchResumeConversations(resumeQuery);
                                }}
                                placeholder="Search by content, summary, or prompt..."
                                className="flex-1 px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                              />
                              <button
                                onClick={() => searchResumeConversations(resumeQuery)}
                                disabled={resumeLoading}
                                className="px-3 py-2 rounded-md bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {resumeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                              </button>
                            </div>
                          </div>

                          {/* Project filter */}
                          {resumeProjects.length > 1 && (
                            <select
                              value={selectedProject}
                              onChange={(e) => {
                                setSelectedProject(e.target.value);
                                searchResumeConversations(resumeQuery, e.target.value);
                              }}
                              className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm focus:outline-none focus:border-zinc-500"
                            >
                              <option value="">All projects</option>
                              {resumeProjects.map((p) => (
                                <option key={p.dirName} value={p.originalPath}>
                                  {p.originalPath}
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Conversation list */}
                          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
                            {resumeLoading ? (
                              <div className="p-6 text-center">
                                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin mx-auto" />
                              </div>
                            ) : resumeError ? (
                              <div className="p-4 text-center">
                                <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
                                <p className="text-xs text-red-400">{resumeError}</p>
                              </div>
                            ) : resumeConversations.length === 0 ? (
                              <div className="p-6 text-center text-zinc-500 text-sm">
                                {resumeQuery ? "No conversations found" : "No Claude conversations found"}
                              </div>
                            ) : (
                              resumeConversations.map((conv) => (
                                <button
                                  key={conv.sessionId}
                                  onClick={() => {
                                    setSelectedConversation(conv);
                                    // Auto-select Claude agent
                                    const claudeAgent = agents.find((a) => a.id === "claude");
                                    if (claudeAgent) setSelectedAgent(claudeAgent);
                                    // Auto-set working directory
                                    if (conv.projectPath) setCwd(conv.projectPath);
                                  }}
                                  className="w-full p-3 hover:bg-canvas text-left transition-colors border-b border-border last:border-b-0"
                                >
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[200px]">
                                      {conv.projectPath.split("/").pop()}
                                    </span>
                                    {conv.gitBranch && (
                                      <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-0.5">
                                        <GitBranch className="w-2.5 h-2.5" />
                                        {conv.gitBranch}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-zinc-600 ml-auto flex-shrink-0">
                                      {conv.messageCount} msgs &middot; {new Date(conv.modified).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <p className="text-xs text-white truncate">
                                    {conv.slug && <span className="text-zinc-400 mr-1">{conv.slug}</span>}
                                    {conv.summary || conv.firstPrompt}
                                  </p>
                                  {!conv.fileExists && (
                                    <p className="text-[10px] text-amber-500 mt-0.5">Session file not found - resume may fail</p>
                                  )}
                                  {conv.fileExists && conv.modified && (Date.now() - new Date(conv.modified).getTime() > 30 * 24 * 60 * 60 * 1000) && (
                                    <p className="text-[10px] text-amber-600 mt-0.5">Session older than 30 days - may have expired</p>
                                  )}
                                  {conv.matchSnippet && (
                                    <p
                                      className="text-[10px] text-zinc-500 truncate mt-0.5"
                                      dangerouslySetInnerHTML={{
                                        __html: conv.matchSnippet
                                          .replace(/>>>/g, '<span class="text-amber-400 font-medium">')
                                          .replace(/<<</g, "</span>"),
                                      }}
                                    />
                                  )}
                                  {!conv.matchSnippet && conv.firstPrompt && conv.summary && (
                                    <p className="text-[10px] text-zinc-500 truncate mt-0.5">{conv.firstPrompt}</p>
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="p-3 rounded-lg bg-zinc-700/30 border border-zinc-600/30">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono text-zinc-400 truncate">
                              {selectedConversation.projectPath.split("/").pop()}
                            </span>
                            <button
                              onClick={() => setSelectedConversation(null)}
                              className="text-[10px] text-zinc-500 hover:text-white"
                            >
                              Change
                            </button>
                          </div>
                          <p className="text-sm text-white">
                            {selectedConversation.slug && <span className="text-zinc-400 mr-1.5">{selectedConversation.slug}</span>}
                            {selectedConversation.summary || selectedConversation.firstPrompt}
                          </p>
                          {!selectedConversation.fileExists && (
                            <p className="text-[10px] text-amber-500 mt-1">Session file not found - resume may fail</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500">
                            {selectedConversation.gitBranch && (
                              <span className="flex items-center gap-0.5">
                                <GitBranch className="w-2.5 h-2.5" />
                                {selectedConversation.gitBranch}
                              </span>
                            )}
                            <span>{selectedConversation.messageCount} messages</span>
                            <span>{new Date(selectedConversation.modified).toLocaleDateString()}</span>
                          </div>
                          {selectedConversation.matchSnippet && (
                            <p
                              className="text-[10px] text-zinc-400 mt-2 line-clamp-2"
                              dangerouslySetInnerHTML={{
                                __html: selectedConversation.matchSnippet
                                  .replace(/>>>/g, '<span class="text-amber-400 font-medium">')
                                  .replace(/<<</g, "</span>"),
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Name & Count (only for new agents) */}
                  {!isReplacing && (
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-2">
                        <label className="text-xs text-zinc-500">Name (optional)</label>
                        <input
                          type="text"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder={selectedAgent?.name || "My Agent"}
                          className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                        />
                      </div>
                      <div className="w-28 space-y-2">
                        <label className="text-xs text-zinc-500">Count</label>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCount(Math.max(1, count - 1))}
                            className="w-8 h-9 rounded-md bg-canvas border border-border text-zinc-400 hover:text-white hover:bg-surface-active transition-colors flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            value={count}
                            onChange={(e) =>
                              setCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
                            }
                            min={1}
                            max={20}
                            className="w-10 h-9 rounded-md bg-canvas border border-border text-white text-sm text-center focus:outline-none focus:border-zinc-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            onClick={() => setCount(Math.min(20, count + 1))}
                            className="w-8 h-9 rounded-md bg-canvas border border-border text-zinc-400 hover:text-white hover:bg-surface-active transition-colors flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Command arguments */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <Terminal className="w-3 h-3" />
                      {selectedAgent?.command ? "Arguments (optional)" : "Command"}
                    </label>
                    <input
                      type="text"
                      value={commandArgs}
                      onChange={(e) => setCommandArgs(e.target.value)}
                      placeholder={selectedAgent?.command ? "e.g. --model opus or --resume" : "e.g. ralph --monitor, ralph-setup, ralph-import"}
                      className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                    />
                    {selectedAgent && (selectedAgent.command || commandArgs) && (
                      <p className="text-[10px] text-zinc-600 font-mono">
                        {selectedAgent.command}{selectedAgent.command && commandArgs ? " " : ""}{commandArgs}
                      </p>
                    )}
                  </div>

                  {/* Working directory */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <FolderOpen className="w-3 h-3" />
                      Working Directory
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cwd}
                        onChange={(e) => setCwd(e.target.value)}
                        placeholder={existingSession?.cwd || launchCwd || "~/"}
                        className="flex-1 px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                      />
                      <button
                        type="button"
                        onClick={openDirPicker}
                        className="px-3 py-2 rounded-md bg-canvas border border-border text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                        title="Browse directories"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Directory picker inline panel */}
                    {showDirPicker && (
                      <div className="rounded-md border border-border bg-canvas overflow-hidden">
                        {/* Current path header */}
                        <div className="px-3 py-2 bg-surface border-b border-border flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {dirBrowseParent && (
                              <button
                                onClick={() => browsePath(dirBrowseParent)}
                                className="p-1 rounded hover:bg-surface-active text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                                title="Go up"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => browsePath("~")}
                              className="p-1 rounded hover:bg-surface-active text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                              title="Home directory"
                            >
                              <Home className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-mono text-zinc-400 truncate" title={dirBrowsePath}>
                              {dirBrowsePath}
                            </span>
                          </div>
                          <button
                            onClick={() => setShowDirPicker(false)}
                            className="p-1 rounded hover:bg-surface-active text-zinc-500 hover:text-white transition-colors flex-shrink-0 ml-2"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Directory list */}
                        <div className="max-h-40 overflow-y-auto">
                          {dirBrowseLoading ? (
                            <div className="p-4 text-center">
                              <Loader2 className="w-4 h-4 text-zinc-500 animate-spin mx-auto" />
                            </div>
                          ) : dirBrowseError ? (
                            <div className="p-3 text-center">
                              <AlertCircle className="w-4 h-4 text-red-500 mx-auto mb-1" />
                              <p className="text-xs text-red-400">{dirBrowseError}</p>
                            </div>
                          ) : dirBrowseDirs.length === 0 ? (
                            <div className="p-4 text-center text-zinc-500 text-xs">
                              No subdirectories
                            </div>
                          ) : (
                            dirBrowseDirs.map((dir) => (
                              <div
                                key={dir.path}
                                className="flex items-center border-b border-border last:border-b-0"
                              >
                                <button
                                  onClick={() => browsePath(dir.path)}
                                  className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-surface-active transition-colors text-left"
                                >
                                  <FolderOpen className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                  <span className="text-sm text-white truncate">{dir.name}</span>
                                </button>
                                <button
                                  onClick={() => selectDirectory(dir.path)}
                                  className="px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-surface-active transition-colors border-l border-border"
                                >
                                  Select
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Select current directory button */}
                        <div className="px-3 py-2 border-t border-border">
                          <button
                            onClick={() => selectDirectory(dirBrowsePath)}
                            className="w-full px-3 py-1.5 rounded-md text-xs font-medium text-white bg-surface-active hover:bg-zinc-700 transition-colors"
                          >
                            Select current: {dirBrowsePath.split("/").pop() || dirBrowsePath}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Git Branch / Worktree options (Blank tab only) */}
                  {activeTab === "blank" && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowBranchOptions(!showBranchOptions)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-canvas border border-border hover:border-zinc-500 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-400" />
                          <span className="text-sm text-zinc-400 group-hover:text-zinc-300">
                            Git Branch (optional)
                          </span>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-zinc-500 transition-transform ${showBranchOptions ? "rotate-180" : ""}`}
                        />
                      </button>

                      {showBranchOptions && (
                        <div className="pl-3 space-y-3 border-l-2 border-zinc-700/50">
                          {/* Mode toggle: Branch vs PR */}
                          <div className="flex gap-1 p-0.5 rounded-md bg-canvas border border-border">
                            <button
                              type="button"
                              onClick={() => { setBranchMode("branch"); setPrNumber(""); }}
                              className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                branchMode === "branch"
                                  ? "bg-surface-active text-white"
                                  : "text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              Branch
                            </button>
                            <button
                              type="button"
                              onClick={() => { setBranchMode("pr"); setBranchName(""); setBaseBranch(defaultBaseBranchRef.current); }}
                              className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                branchMode === "pr"
                                  ? "bg-surface-active text-white"
                                  : "text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              PR #
                            </button>
                          </div>

                          {branchMode === "branch" ? (
                            <>
                              <div>
                                <label className="text-xs text-zinc-500 mb-1.5 block">Branch name</label>
                                <input
                                  type="text"
                                  value={branchName}
                                  onChange={(e) => setBranchName(e.target.value)}
                                  placeholder="feature/my-branch"
                                  className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                                />
                              </div>

                              {branchName && (
                                <>
                                  <div>
                                    <label className="text-xs text-zinc-500 mb-1.5 block">Base branch</label>
                                    <input
                                      type="text"
                                      value={baseBranch}
                                      onChange={(e) => setBaseBranch(e.target.value)}
                                      placeholder="main"
                                      className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                                    />
                                  </div>

                                  <div className="flex items-start gap-2 px-3 py-2 rounded bg-zinc-900/50 border border-zinc-800">
                                    <GitBranch className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                                      A worktree will be created in an isolated directory
                                    </p>
                                  </div>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <div>
                                <label className="text-xs text-zinc-500 mb-1.5 block">PR number</label>
                                <input
                                  type="text"
                                  value={prNumber}
                                  onChange={(e) => setPrNumber(e.target.value.replace(/[^0-9]/g, ""))}
                                  placeholder="123"
                                  className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                                />
                              </div>

                              {prNumber && (
                                <div className="flex items-start gap-2 px-3 py-2 rounded bg-zinc-900/50 border border-zinc-800">
                                  <GitBranch className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
                                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                                    Will checkout PR #{prNumber} in an isolated worktree
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Conflict warning when no worktree */}
                      {!branchName && conflictingAgentCount > 0 && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded bg-amber-500/10 border border-amber-500/20">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-amber-400 leading-relaxed">
                            {conflictingAgentCount} other agent{conflictingAgentCount > 1 ? "s are" : " is"} working in this directory.
                            Write operations may conflict.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-canvas border-t border-border flex justify-end gap-2 flex-shrink-0">
                  <button
                    onClick={handleClose}
                    className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!selectedAgent || isCreating || (!selectedAgent?.command && !commandArgs && activeTab !== "resume") || (activeTab === "github" && !selectedGithubIssue) || (activeTab === "resume" && !selectedConversation)}
                    className="px-4 py-1.5 rounded-md text-sm font-medium text-canvas bg-white hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreating
                      ? "Creating..."
                      : activeTab === "resume"
                      ? "Resume"
                      : isReplacing
                      ? "Start Session"
                      : count > 1
                      ? `Create ${count} Agents`
                      : "Create"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
