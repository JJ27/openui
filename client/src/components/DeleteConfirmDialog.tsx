import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, X, Loader2, GitBranch, AlertTriangle } from "lucide-react";

interface GitInfo {
  hasWorktree: boolean;
  localBranch: string | null;
  remoteBranch: string | null;
  cwd: string;
}

interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionName: string;
  onConfirm: (cleanup: {
    deleteLocalBranch: boolean;
    deleteRemoteBranch: boolean;
  }) => Promise<void>;
}

const HOLD_DURATION = 3000;

export function DeleteConfirmDialog({
  open,
  onClose,
  sessionId,
  sessionName,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [destroying, setDestroying] = useState(false);
  const [deleteLocalBranch, setDeleteLocalBranch] = useState(false);
  const [deleteRemoteBranch, setDeleteRemoteBranch] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setGitInfo(null);
    setHoldProgress(0);
    setDestroying(false);
    setDeleteLocalBranch(false);
    setDeleteRemoteBranch(false);

    fetch(`/api/sessions/${sessionId}/git-info`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setGitInfo(data);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  const hasDestructiveChecked =
    (gitInfo?.localBranch && deleteLocalBranch) ||
    (gitInfo?.remoteBranch && deleteRemoteBranch);

  const handleConfirm = useCallback(async () => {
    setDestroying(true);
    try {
      await onConfirm({
        deleteLocalBranch: gitInfo?.localBranch ? deleteLocalBranch : false,
        deleteRemoteBranch: gitInfo?.remoteBranch ? deleteRemoteBranch : false,
      });
    } finally {
      setDestroying(false);
    }
  }, [onConfirm, gitInfo, deleteLocalBranch, deleteRemoteBranch]);

  const startHold = useCallback(() => {
    if (!hasDestructiveChecked || destroying) return;
    holdStartRef.current = performance.now();
    const tick = () => {
      if (!holdStartRef.current) return;
      const elapsed = performance.now() - holdStartRef.current;
      const progress = Math.min(elapsed / HOLD_DURATION, 1);
      setHoldProgress(progress);
      if (progress >= 1) {
        holdStartRef.current = null;
        handleConfirm();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [hasDestructiveChecked, destroying, handleConfirm]);

  const cancelHold = useCallback(() => {
    holdStartRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setHoldProgress(0);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const hasAnyOption = gitInfo && (gitInfo.localBranch || gitInfo.remoteBranch);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-sm mx-4">
              <div className="rounded-xl bg-surface border border-border shadow-2xl overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-red-500/60 via-red-500/40 to-transparent" />
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <h2 className="text-sm font-medium text-white">Delete {sessionName}</h2>
                  </div>
                  <button onClick={onClose} className="p-1 rounded hover:bg-surface-active text-zinc-500 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                      <span className="ml-2 text-xs text-zinc-500">Detecting git state...</span>
                    </div>
                  ) : error ? (
                    <div className="text-xs text-red-400 py-2">Failed to detect git state: {error}</div>
                  ) : (
                    <>
                      {hasAnyOption ? (
                        <div className="space-y-3">
                          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-zinc-400">Optionally clean up branches. These actions are <span className="text-red-400 font-medium">irreversible</span>.</p>
                          </div>
                          {gitInfo.localBranch && (
                            <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg bg-canvas border cursor-pointer transition-colors ${deleteLocalBranch ? "border-red-500/30 bg-red-500/5" : "border-border hover:border-zinc-600"}`}>
                              <input type="checkbox" checked={deleteLocalBranch} onChange={(e) => setDeleteLocalBranch(e.target.checked)} className="accent-red-500" />
                              <GitBranch className={`w-3.5 h-3.5 shrink-0 ${deleteLocalBranch ? "text-red-400" : "text-zinc-500"}`} />
                              <span className="text-xs text-zinc-300">Delete local branch <span className="text-zinc-500 font-mono">{gitInfo.localBranch}</span></span>
                            </label>
                          )}
                          {gitInfo.remoteBranch && (
                            <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg bg-canvas border cursor-pointer transition-colors ${deleteRemoteBranch ? "border-red-500/30 bg-red-500/5" : "border-border hover:border-zinc-600"}`}>
                              <input type="checkbox" checked={deleteRemoteBranch} onChange={(e) => setDeleteRemoteBranch(e.target.checked)} className="accent-red-500" />
                              <Trash2 className={`w-3.5 h-3.5 shrink-0 ${deleteRemoteBranch ? "text-red-400" : "text-zinc-500"}`} />
                              <span className="text-xs text-zinc-300">Delete remote branch <span className="text-zinc-500 font-mono">origin/{gitInfo.remoteBranch}</span></span>
                            </label>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 py-1">No branches detected. Session will be deleted.</p>
                      )}
                    </>
                  )}
                </div>
                {!loading && !error && (
                  <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-surface-active transition-colors">Cancel</button>
                    {hasDestructiveChecked ? (
                      <button
                        onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold} onTouchStart={startHold} onTouchEnd={cancelHold}
                        disabled={destroying}
                        className="relative px-4 py-1.5 rounded-md text-xs font-medium text-white bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors overflow-hidden select-none disabled:opacity-50 min-w-[140px]"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-red-600 transition-none" style={{ width: `${holdProgress * 100}%`, opacity: holdProgress > 0 ? 0.8 : 0 }} />
                        <span className="relative z-10 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3" />
                          {destroying ? "Deleting..." : holdProgress > 0 ? `Hold... ${Math.ceil(HOLD_DURATION / 1000 * (1 - holdProgress))}s` : "Hold to delete"}
                        </span>
                      </button>
                    ) : (
                      <button onClick={handleConfirm} disabled={destroying} className="px-4 py-1.5 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50">
                        {destroying ? "Deleting..." : "Delete"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
