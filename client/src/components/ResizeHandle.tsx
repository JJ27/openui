import { useEffect, useRef } from "react";
import { GripVertical } from "lucide-react";

interface ResizeHandleProps {
  onResize: (width: number) => void;
  initialWidth: number;
  minWidth?: number;
}

export function ResizeHandle({
  onResize,
  minWidth = 320,
}: ResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.max(minWidth, window.innerWidth - e.clientX);
      onResizeRef.current(newWidth);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    el.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [minWidth]);

  return (
    <div
      ref={handleRef}
      className="group absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 group-hover:bg-blue-500/30 transition-colors" />
      <div className="relative z-10 flex items-center justify-center w-6 h-12 rounded-md bg-zinc-700/80 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-4 h-4 text-white" />
      </div>
    </div>
  );
}
