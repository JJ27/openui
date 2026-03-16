import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { SerializeAddon } from "@xterm/addon-serialize";
import "@xterm/xterm/css/xterm.css";
import { useStore, AgentStatus } from "../stores/useStore";

interface TerminalProps {
  sessionId: string;
  color: string;
  nodeId: string;
  isShell?: boolean;
}

// Cache key helpers
const snapshotKey = (sessionId: string) => `term-snapshot-${sessionId}`;
const legacyCacheKey = (sessionId: string) => `term-cache-${sessionId}`;
const legacySeqKey = (sessionId: string) => `term-seq-${sessionId}`;

interface TerminalSnapshot {
  content: string;
  seq: number;
  cols: number;
  rows: number;
}

const inMemorySnapshots = new Map<string, TerminalSnapshot>();

function isSnapshotCompatible(snapshot: TerminalSnapshot, cols: number): boolean {
  return Number.isFinite(snapshot.seq)
    && snapshot.seq >= 0
    && Number.isFinite(snapshot.cols)
    && snapshot.cols > 0
    && Number.isFinite(snapshot.rows)
    && snapshot.rows > 0
    && snapshot.cols === cols;
}

function readSnapshot(sessionId: string, cols: number): TerminalSnapshot | null {
  const memorySnapshot = inMemorySnapshots.get(sessionId);
  if (memorySnapshot && isSnapshotCompatible(memorySnapshot, cols)) {
    return memorySnapshot;
  }

  try {
    const raw = sessionStorage.getItem(snapshotKey(sessionId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (typeof parsed?.content !== "string") return null;

    const snapshot: TerminalSnapshot = {
      content: parsed.content,
      seq: Number(parsed?.seq),
      cols: Number(parsed?.cols),
      rows: Number(parsed?.rows),
    };

    if (!isSnapshotCompatible(snapshot, cols)) return null;
    inMemorySnapshots.set(sessionId, snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

function writeSnapshot(sessionId: string, snapshot: TerminalSnapshot): boolean {
  inMemorySnapshots.set(sessionId, snapshot);

  try {
    sessionStorage.setItem(snapshotKey(sessionId), JSON.stringify(snapshot));
    sessionStorage.removeItem(legacyCacheKey(sessionId));
    sessionStorage.removeItem(legacySeqKey(sessionId));
    return true;
  } catch {
    return false;
  }
}

function clearLegacySnapshot(sessionId: string) {
  try {
    sessionStorage.removeItem(legacyCacheKey(sessionId));
    sessionStorage.removeItem(legacySeqKey(sessionId));
  } catch {}
}

export function Terminal({ sessionId, color, nodeId, isShell }: TerminalProps) {
  const updateSession = useStore((state) => state.updateSession);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const mountedRef = useRef(false);
  const lastSeqRef = useRef(0);
  // Tracks the highest seq whose term.write() callback has fired, guaranteeing
  // that serialize() output is consistent with this seq on unmount.
  const committedSeqRef = useRef(0);
  // Track user scroll intent via wheel events (more reliable than wasAtBottom)
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    if (!terminalRef.current || !sessionId) return;

    // Prevent double mount in strict mode
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Clear container completely
    while (terminalRef.current.firstChild) {
      terminalRef.current.removeChild(terminalRef.current.firstChild);
    }

    // Create terminal
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 12,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace',
      fontWeight: "400",
      lineHeight: 1.4,
      letterSpacing: 0,
      theme: {
        background: "#0d0d0d",
        foreground: "#d4d4d4",
        cursor: color,
        cursorAccent: "#0d0d0d",
        selectionBackground: "#3b3b3b",
        selectionForeground: "#ffffff",
        black: "#1a1a1a",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#d4d4d4",
        brightBlack: "#525252",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fcd34d",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
      scrollback: 7500,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const serializeAddon = new SerializeAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(serializeAddon);

    term.open(terminalRef.current);

    // Fit before restoring cached content so wrapped lines are rehydrated
    // against the current sidebar width instead of the default 80x24 size.
    try {
      fitAddon.fit();
    } catch {}

    // GPU-accelerated rendering for better performance on long sessions
    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose();
        webglAddon = null;
      });
      term.loadAddon(webglAddon);
    } catch {
      webglAddon = null;
    }

    // Reset attributes and show cursor
    term.write("\x1b[0m\x1b[?25h");

    // Run one more fit after layout settles (sidebar animation, fonts, etc).
    setTimeout(() => fitAddon.fit(), 50);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    serializeAddonRef.current = serializeAddon;

    // Drop legacy two-key cache entries so only atomic snapshots remain.
    clearLegacySnapshot(sessionId);

    // Try to restore from cache for instant display.
    let cachedSeq = 0;
    let restoredFromCache = false;
    const snapshot = readSnapshot(sessionId, term.cols);
    if (snapshot) {
      cachedSeq = snapshot.seq;
      restoredFromCache = true;
      lastSeqRef.current = cachedSeq;
      committedSeqRef.current = cachedSeq;
    }

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsBase = `${protocol}//${window.location.host}/ws?sessionId=${sessionId}`;

    let ws: WebSocket | null = null;
    let isFirstMessage = true;

    // Debounced cache save — serialize terminal state to sessionStorage.
    // We flush xterm's write queue first (via an empty write) to ensure all
    // pending data has been processed before serializing, then persist the
    // content and seq together as a single snapshot. This keeps reconnects
    // safe even when storage quota is hit: either both values update, or
    // neither does.
    let cacheTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleCacheSave = () => {
      if (cacheTimeout) clearTimeout(cacheTimeout);
      cacheTimeout = setTimeout(() => {
        if (!mountedRef.current || !serializeAddonRef.current) return;
        // Flush xterm's write queue before serializing
        term.write("", () => {
          if (!mountedRef.current || !serializeAddonRef.current) return;
          try {
            const serialized = serializeAddonRef.current.serialize();
            writeSnapshot(sessionId, {
              content: serialized,
              seq: committedSeqRef.current,
              cols: term.cols,
              rows: term.rows,
            });
          } catch {}
        });
      }, 500);
    };

    const connectWs = () => {
      if (!mountedRef.current) return;

      // Use committedSeqRef so reconnects send the accurate "last fully-written" seq
      ws = new WebSocket(`${wsBase}&lastSeq=${committedSeqRef.current}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Fit terminal first to get accurate dimensions
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
        // Send accurate dimensions to PTY
        if (xtermRef.current) {
          ws?.send(JSON.stringify({ type: "resize", cols: xtermRef.current.cols, rows: xtermRef.current.rows }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output") {
            // Track sequence number
            if (msg.seq !== undefined) {
              lastSeqRef.current = msg.seq;
            }

            if (isFirstMessage) {
              isFirstMessage = false;

              if (restoredFromCache && (!msg.data || msg.data.length === 0)) {
                // Cache was up to date — already displaying, just reveal if not visible
                committedSeqRef.current = lastSeqRef.current;
                if (terminalRef.current) {
  
                  term.focus();
                }
              } else if (restoredFromCache && msg.isDelta && msg.data) {
                // Delta replay — cache is valid, just append the missed output
                const seqAtWrite = lastSeqRef.current;
                term.write(msg.data, () => {
                  if (mountedRef.current) {
                    committedSeqRef.current = seqAtWrite;
                    term.scrollToBottom();
                    if (terminalRef.current) {
      
                      term.focus();
                    }
                    scheduleCacheSave();
                  }
                });
              } else if (msg.data && msg.data.length > 0) {
                // Server sent full buffer (cache miss or too stale) — clear everything
                // including scrollback (which may contain stale cache content) and render fresh
                term.clear();
                term.write("\x1b[2J\x1b[H\x1b[0m\x1b[?25h");
                const seqAtWrite = lastSeqRef.current;
                term.write(msg.data, () => {
                  if (mountedRef.current) {
                    committedSeqRef.current = seqAtWrite;
                    term.scrollToBottom();
                    if (terminalRef.current) {
      
                      term.focus();
                    }
                    // Cache the fresh state
                    scheduleCacheSave();
                  }
                });
              } else {
                // No cache, no buffer — just show empty terminal
                term.write("\x1b[?25h");
                if (terminalRef.current) {
  
                  term.focus();
                }
              }
            } else {
              // Live output — append and schedule cache save
              if (msg.data) {
                const seqAtWrite = lastSeqRef.current;
                term.write(msg.data, () => {
                  committedSeqRef.current = seqAtWrite;
                });
                // Scroll after write is queued — xterm batches writes and renders
                // in the next animation frame, so scheduling scroll there avoids
                // the visible jump caused by scrolling inside the write callback.
                if (!userScrolledUpRef.current && mountedRef.current) {
                  requestAnimationFrame(() => {
                    if (mountedRef.current && !userScrolledUpRef.current) {
                      term.scrollToBottom();
                    }
                  });
                }
                scheduleCacheSave();
              }
            }
          } else if (msg.type === "status" && !isShell) {
            // Handle status updates from plugin hooks (skip for raw shell terminals)
            updateSession(nodeId, {
              status: msg.status as AgentStatus,
              isRestored: msg.isRestored,
              currentTool: msg.currentTool,
              ...(msg.gitBranch ? { gitBranch: msg.gitBranch } : {}),
              longRunningTool: msg.longRunningTool || false,
              ...(msg.model ? { model: msg.model } : {}),
              sleepEndTime: msg.sleepEndTime,
            });
          } else if (msg.type === "auth_required") {
            // OAuth detected during session start — show auth banner
            useStore.getState().setAuthRequired(msg.url);
          } else if (msg.type === "auth_complete") {
            // Auth completed — dismiss banner
            useStore.getState().clearAuthRequired();
          }
        } catch (e) {
          term.write(event.data);
        }
      };

      ws.onerror = () => {
        // Silently handle errors - don't spam the terminal
      };

      ws.onclose = () => {
        // Auto-reconnect after a delay if still mounted
        if (mountedRef.current) {
          setTimeout(() => {
            if (mountedRef.current) {
              isFirstMessage = true;
              // Terminal already has content — tell first-message handler so it
              // uses the delta path instead of clearing the screen unnecessarily.
              restoredFromCache = true;
              connectWs();
            }
          }, 2000);
        }
      };
    };

    // If we have cached content, write it first and connect WebSocket only after
    // the write completes. This prevents a race where the server's "cache hit" (empty)
    // response arrives before xterm finishes rendering the cached content → black screen.
    let connectTimeout: ReturnType<typeof setTimeout>;
    if (snapshot) {
      term.write(snapshot.content, () => {
        if (mountedRef.current) {
          term.scrollToBottom();
          term.focus();
        }
        connectTimeout = setTimeout(connectWs, 50);
      });
    } else {
      // No cache — connect immediately
      connectTimeout = setTimeout(connectWs, 100);
    }

    term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        // Filter out Cursor Position Report responses (\x1b[row;colR) that xterm.js
        // generates in reply to DSR queries (\x1b[6n) from the shell. If these arrive
        // when the shell isn't expecting them, they leak as visible ";3R;1R" text.
        const filtered = data.replace(/\x1b\[\d+;\d+R/g, "");
        if (filtered) {
          ws.send(JSON.stringify({ type: "input", data: filtered }));
        }
      }
    });

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (!fitAddonRef.current || !xtermRef.current || !terminalRef.current) return;
        if (terminalRef.current.clientWidth === 0 || terminalRef.current.clientHeight === 0) return;

        const t = xtermRef.current;
        // Remember if user was scrolled to bottom
        const wasAtBottom = t.buffer.active.viewportY >= t.buffer.active.baseY;

        fitAddonRef.current.fit();

        // Restore scroll position after fit to prevent viewport jumping
        if (wasAtBottom) {
          t.scrollToBottom();
        }

        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: t.cols, rows: t.rows }));
        }
      }, 150);
    });

    resizeObserver.observe(terminalRef.current);

    const handleWheel = (e: WheelEvent) => {
      if (!xtermRef.current) return;
      if (e.deltaY < 0) {
        userScrolledUpRef.current = true;
      } else if (e.deltaY > 0) {
        requestAnimationFrame(() => {
          if (!xtermRef.current) return;
          const t = xtermRef.current;
          if (t.buffer.active.viewportY >= t.buffer.active.baseY) {
            userScrolledUpRef.current = false;
          }
        });
      }
    };
    terminalRef.current.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      // Best-effort cache save on unmount. Persist content + seq atomically so
      // reconnects never pair a stale screen buffer with a newer seq number.
      if (serializeAddonRef.current) {
        try {
          const serialized = serializeAddonRef.current.serialize();
          writeSnapshot(sessionId, {
            content: serialized,
            seq: committedSeqRef.current,
            cols: term.cols,
            rows: term.rows,
          });
        } catch {}
      }
      mountedRef.current = false;
      if (cacheTimeout) clearTimeout(cacheTimeout);
      clearTimeout(connectTimeout);
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      terminalRef.current?.removeEventListener("wheel", handleWheel);
      ws?.close();
      // Dispose WebGL addon before terminal to avoid internal reference errors
      try { webglAddon?.dispose(); } catch {}
      webglAddon = null;
      term.dispose();
    };
  }, [sessionId, color, nodeId, updateSession]);

  return (
    <div
      ref={terminalRef}
      className="w-full h-full overflow-hidden"
      style={{
        padding: "12px",
        backgroundColor: "#0d0d0d",
        minHeight: "200px",
        boxSizing: "border-box",
      }}
    />
  );
}
