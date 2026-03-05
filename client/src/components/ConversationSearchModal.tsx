import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Loader2,
  AlertCircle,
  GitBranch,
  MessageSquare,
  Play,
} from "lucide-react";

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

interface ConversationSearchModalProps {
  open: boolean;
  onClose: () => void;
  onResume: (conversation: ClaudeConversation) => void;
}

export function ConversationSearchModal({ open, onClose, onResume }: ConversationSearchModalProps) {
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<ClaudeConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ dirName: string; originalPath: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState("");

  // Load projects on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setConversations([]);
      setError(null);
      setSelectedProject("");

      fetch("/api/claude/projects")
        .then((res) => res.json())
        .then((data) => setProjects(data))
        .catch(() => {});

      // Load recent conversations immediately
      searchConversations("", "");
    }
  }, [open]);

  const searchConversations = useCallback(async (q: string, project: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (project) params.set("projectPath", project);
      params.set("limit", "50");

      const res = await fetch(`/api/claude/conversations?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to search conversations");
      }
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = () => {
    searchConversations(query, selectedProject);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") onClose();
  };

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="relative w-[640px] max-h-[70vh] rounded-xl bg-surface border border-border shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-3 border-b border-border flex items-center gap-3">
              <Search className="w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search conversations..."
                className="flex-1 bg-transparent text-white text-sm placeholder-zinc-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-3 py-1 rounded-md bg-zinc-700 text-white text-xs font-medium hover:bg-zinc-600 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Search"}
              </button>
              <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-active transition-colors">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            {/* Project filter */}
            {projects.length > 1 && (
              <div className="px-5 py-2 border-b border-border">
                <select
                  value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    searchConversations(query, e.target.value);
                  }}
                  className="w-full px-3 py-1.5 rounded-md bg-canvas border border-border text-white text-xs focus:outline-none focus:border-zinc-500"
                >
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.dirName} value={p.originalPath}>
                      {p.originalPath}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin mx-auto" />
                </div>
              ) : error ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-2" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-sm">
                  {query ? "No conversations found" : "No Claude conversations found"}
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.sessionId}
                    className="px-5 py-3 hover:bg-canvas transition-colors border-b border-border last:border-b-0 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Project + branch + date */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[200px]">
                            {conv.projectPath.split("/").pop()}
                          </span>
                          {conv.gitBranch && (
                            <span className="text-[10px] font-mono text-purple-400 flex items-center gap-0.5">
                              <GitBranch className="w-2.5 h-2.5" />
                              {conv.gitBranch}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-600 ml-auto flex-shrink-0 flex items-center gap-1">
                            <MessageSquare className="w-2.5 h-2.5" />
                            {conv.messageCount} &middot; {new Date(conv.modified).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Summary / first prompt */}
                        <p className="text-xs text-white truncate">
                          {conv.slug && <span className="text-zinc-400 mr-1">{conv.slug}</span>}
                          {conv.summary || conv.firstPrompt}
                        </p>

                        {/* Warnings */}
                        {!conv.fileExists && (
                          <p className="text-[10px] text-amber-500 mt-0.5">Session file not found - resume may fail</p>
                        )}
                        {conv.fileExists && conv.modified && (Date.now() - new Date(conv.modified).getTime() > 30 * 24 * 60 * 60 * 1000) && (
                          <p className="text-[10px] text-amber-600 mt-0.5">Session older than 30 days - may have expired</p>
                        )}

                        {/* Search snippet */}
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
                      </div>

                      {/* Resume button */}
                      <button
                        onClick={() => onResume(conv)}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 px-2 py-1 rounded-md bg-zinc-700 text-white text-[10px] font-medium hover:bg-zinc-600 transition-all flex items-center gap-1"
                      >
                        <Play className="w-2.5 h-2.5" />
                        Resume
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-2 border-t border-border">
              <p className="text-[10px] text-zinc-600 text-center">
                Press Enter to search &middot; Esc to close
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
