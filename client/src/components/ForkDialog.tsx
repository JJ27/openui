import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  GitFork,
  GitBranch,
  FolderOpen,
  ArrowUp,
  Home,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Sparkles,
  Code,
  Cpu,
  Zap,
  Rocket,
  Bot,
  Brain,
  Wand2,
} from "lucide-react";
import { useStore } from "../stores/useStore";

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

export interface ForkDialogResult {
  name: string;
  color: string;
  icon: string;
  cwd?: string;
  branchName?: string;
  baseBranch?: string;
  prNumber?: string;
}

interface ForkDialogProps {
  open: boolean;
  onClose: () => void;
  parentName: string;
  parentColor: string;
  parentIcon: string;
  parentCwd: string;
  onConfirm: (result: ForkDialogResult) => void;
}

export function ForkDialog({
  open,
  onClose,
  parentName,
  parentColor,
  parentIcon,
  parentCwd,
  onConfirm,
}: ForkDialogProps) {
  // Form state
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [icon, setIcon] = useState("");
  const [cwd, setCwd] = useState("");

  // Directory picker state
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [dirBrowsePath, setDirBrowsePath] = useState("");
  const [dirBrowseParent, setDirBrowseParent] = useState<string | null>(null);
  const [dirBrowseDirs, setDirBrowseDirs] = useState<{ name: string; path: string }[]>([]);
  const [dirBrowseLoading, setDirBrowseLoading] = useState(false);
  const [dirBrowseError, setDirBrowseError] = useState<string | null>(null);

  // Branch / worktree state
  const [showBranchOptions, setShowBranchOptions] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const defaultBaseBranchRef = useRef("main");
  const [branchMode, setBranchMode] = useState<"branch" | "pr">("branch");
  const [prNumber, setPrNumber] = useState("");
  const [isForking, setIsForking] = useState(false);

  // Conflict warning
  const sessions = useStore((state) => state.sessions);
  const effectiveCwd = cwd || parentCwd;
  const conflictingAgentCount = !branchName && !prNumber
    ? Array.from(sessions.values()).filter(
        (s) => s.cwd === effectiveCwd && !s.archived && s.status !== "disconnected"
      ).length
    : 0;

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      // Fetch default base branch from settings
      fetch("/api/settings")
        .then((res) => res.json())
        .then((config) => {
          const base = config.defaultBaseBranch || "main";
          defaultBaseBranchRef.current = base;
          setBaseBranch(base);
        })
        .catch(() => {});

      setName(`${parentName} (fork)`);
      setColor(parentColor);
      setIcon(parentIcon);
      setCwd("");
      setShowDirPicker(false);
      setShowBranchOptions(false);
      setBranchName("");
      setBaseBranch(defaultBaseBranchRef.current);
      setBranchMode("branch");
      setPrNumber("");
      setIsForking(false);
    }
  }, [open, parentName, parentColor, parentIcon]);

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
    browsePath(cwd || parentCwd);
  };

  const selectDirectory = (path: string) => {
    setCwd(path);
    setShowDirPicker(false);
  };

  const isForkDisabled = !name.trim() || isForking;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isForkDisabled) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      handleConfirm();
    }
  };

  const handleConfirm = () => {
    setIsForking(true);
    onConfirm({
      name,
      color,
      icon,
      ...(cwd && cwd !== parentCwd ? { cwd } : {}),
      ...(branchName ? {
        branchName,
        baseBranch,
      } : {}),
      ...(prNumber ? { prNumber } : {}),
    });
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md mx-4" onKeyDown={handleKeyDown}>
              <div className="rounded-xl bg-surface border border-border shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitFork className="w-4 h-4 text-zinc-400" />
                    <h2 className="text-sm font-medium text-white">Fork Agent</h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-surface-active text-zinc-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                  {/* Name */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Fork name"
                      className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                      autoFocus
                    />
                  </div>

                  {/* Color */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Color</label>
                    <div className="flex gap-2">
                      {presetColors.map((c) => (
                        <button
                          key={c}
                          onClick={() => setColor(c)}
                          className="w-7 h-7 rounded-full transition-all flex items-center justify-center"
                          style={{
                            backgroundColor: c,
                            outline: color === c ? `2px solid ${c}` : "none",
                            outlineOffset: "2px",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Icon</label>
                    <div className="flex gap-2">
                      {iconOptions.map((opt) => {
                        const IconComp = opt.icon;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => setIcon(opt.id)}
                            className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${
                              icon === opt.id
                                ? "bg-zinc-600 text-white ring-1 ring-zinc-400"
                                : "bg-canvas border border-border text-zinc-500 hover:text-white hover:border-zinc-500"
                            }`}
                            title={opt.label}
                          >
                            <IconComp className="w-4 h-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Directory */}
                  <div>
                    <label className="text-xs text-zinc-500 mb-1.5 block">Directory</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cwd || parentCwd}
                        onChange={(e) => setCwd(e.target.value)}
                        placeholder={parentCwd}
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

                    {/* Directory picker */}
                    {showDirPicker && (
                      <div className="mt-2 rounded-md border border-border bg-canvas overflow-hidden">
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

                  {/* Git Branch / Worktree */}
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
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-canvas border-t border-border flex justify-end gap-2">
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={isForkDisabled}
                    className="px-4 py-1.5 rounded-md text-sm font-medium text-canvas bg-white hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    {isForking ? "Forking..." : "Fork"}
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
