import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [defaultBaseBranch, setDefaultBaseBranch] = useState("main");
  const [createWorktree, setCreateWorktree] = useState(true);
  const [updateChannel, setUpdateChannel] = useState("stable");
  const [isSaving, setIsSaving] = useState(false);

  // Load existing config
  useEffect(() => {
    if (open) {
      fetch("/api/settings")
        .then((res) => res.json())
        .then((config) => {
          setDefaultBaseBranch(config.defaultBaseBranch || "main");
          setCreateWorktree(config.createWorktree ?? true);
          setUpdateChannel(config.updateChannel || "stable");
        })
        .catch(console.error);
    }
  }, [open]);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultBaseBranch,
          createWorktree,
          updateChannel,
        }),
      });

      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setIsSaving(false);
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md mx-4">
            <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Settings</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-6">
                {/* Update Channel */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-3">Updates</h3>
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500 block mb-1.5">
                      Update channel
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setUpdateChannel("stable")}
                        className={`flex-1 px-3 py-2 rounded-md text-sm border transition-colors ${
                          updateChannel === "stable"
                            ? "border-green-500/50 bg-green-500/10 text-green-400"
                            : "border-border bg-canvas text-zinc-400 hover:text-white hover:border-zinc-500"
                        }`}
                      >
                        Stable
                      </button>
                      <button
                        onClick={() => setUpdateChannel("main")}
                        className={`flex-1 px-3 py-2 rounded-md text-sm border transition-colors ${
                          updateChannel === "main"
                            ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                            : "border-border bg-canvas text-zinc-400 hover:text-white hover:border-zinc-500"
                        }`}
                      >
                        Beta
                      </button>
                    </div>
                    <p className="text-xs text-zinc-600">
                      {updateChannel === "stable"
                        ? "Receive tested, stable updates only."
                        : "Receive the latest changes from main. May contain bugs."}
                    </p>
                  </div>
                </div>

                {/* Git Settings */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-3">Git</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1.5">
                        Default base branch
                      </label>
                      <input
                        type="text"
                        value={defaultBaseBranch}
                        onChange={(e) => setDefaultBaseBranch(e.target.value)}
                        placeholder="main"
                        className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createWorktree}
                        onChange={(e) => setCreateWorktree(e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-600 bg-canvas text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                      />
                      <span className="text-sm text-zinc-300">
                        Create git worktree for new branches
                      </span>
                    </label>
                    <p className="text-xs text-zinc-600 ml-6">
                      Each branch gets an isolated working directory
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-md text-sm font-medium bg-white text-canvas hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? "Saving..." : "Save"}
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
