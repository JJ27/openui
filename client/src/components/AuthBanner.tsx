import { useStore } from "../stores/useStore";
import { AlertTriangle, ExternalLink, X } from "lucide-react";

export function AuthBanner() {
  const authRequired = useStore((state) => state.authRequired);
  const authUrl = useStore((state) => state.authUrl);
  const clearAuthRequired = useStore((state) => state.clearAuthRequired);

  if (!authRequired) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-sm text-amber-300">
          Authentication required — agents are paused until you log in.
        </span>
        {authUrl && (
          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2 flex-shrink-0"
          >
            Open auth page
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <button
        onClick={clearAuthRequired}
        className="p-1 rounded hover:bg-amber-500/20 text-amber-500 hover:text-amber-300 transition-colors flex-shrink-0"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
