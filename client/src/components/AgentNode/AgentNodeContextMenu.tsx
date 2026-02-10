import { createPortal } from "react-dom";
import { Trash2, GitFork } from "lucide-react";

interface AgentNodeContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: () => void;
  onFork?: () => void;
  showFork?: boolean;
}

export function AgentNodeContextMenu({
  position,
  onClose,
  onDelete,
  onFork,
  showFork,
}: AgentNodeContextMenuProps) {
  return createPortal(
    <div
      className="context-menu-container fixed z-[9999] min-w-[160px] rounded-lg border shadow-xl py-1"
      style={{
        left: position.x,
        top: position.y,
        backgroundColor: "#262626",
        borderColor: "#333",
      }}
    >
      {showFork && onFork && (
        <button
          onClick={() => {
            onFork();
            onClose();
          }}
          className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
        >
          <GitFork className="w-3.5 h-3.5" />
          Fork
        </button>
      )}
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-white/5 flex items-center gap-2"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>,
    document.body
  );
}
