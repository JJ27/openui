import { createContext, useContext, useEffect, useRef } from "react";
import { TerminalPool } from "../services/TerminalPool";
import { useStore } from "../stores/useStore";

const TerminalPoolContext = createContext<TerminalPool | null>(null);

export function TerminalPoolProvider({
  children,
  maxSize = 6,
}: {
  children: React.ReactNode;
  maxSize?: number;
}) {
  const poolRef = useRef<TerminalPool | null>(null);

  if (!poolRef.current) {
    poolRef.current = new TerminalPool(maxSize, {
      onStatusUpdate: (nodeId, updates) => {
        useStore.getState().updateSession(nodeId, updates);
      },
      onAuthRequired: (url) => {
        useStore.getState().setAuthRequired(url);
      },
      onAuthClear: () => {
        useStore.getState().clearAuthRequired();
      },
    });
  }

  // Cleanup on unmount
  useEffect(() => () => poolRef.current?.destroy(), []);

  // Global resize handler — refit all pooled terminals
  useEffect(() => {
    const handler = () => poolRef.current?.resize();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <TerminalPoolContext.Provider value={poolRef.current}>
      {children}
    </TerminalPoolContext.Provider>
  );
}

export function useTerminalPool(): TerminalPool {
  const pool = useContext(TerminalPoolContext);
  if (!pool) throw new Error("useTerminalPool must be used within TerminalPoolProvider");
  return pool;
}
