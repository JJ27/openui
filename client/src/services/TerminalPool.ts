import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { SerializeAddon } from "@xterm/addon-serialize";
import "@xterm/xterm/css/xterm.css";
import { readSnapshot, writeSnapshot, clearLegacySnapshot } from "./terminalSnapshot";

interface PooledTerminal {
  id: string;
  sessionId: string;
  nodeId: string;
  color: string;
  isShell: boolean;
  term: XTerm;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  webglAddon: WebglAddon | null;
  container: HTMLDivElement;
  ws: WebSocket | null;
  wsReconnectTimer: ReturnType<typeof setTimeout> | null;
  lastSeq: number;
  committedSeq: number;
  lastAccessTime: number;
  userScrolledUp: boolean;
  cacheTimeout: ReturnType<typeof setTimeout> | null;
  resizeObserver: ResizeObserver | null;
  alive: boolean; // false after release()
}

export interface PoolCallbacks {
  onStatusUpdate: (nodeId: string, updates: any) => void;
  onAuthRequired: (url: string) => void;
  onAuthClear: () => void;
}

const TERMINAL_THEME = {
  background: "#0d0d0d",
  foreground: "#d4d4d4",
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
};

export class TerminalPool {
  private pool = new Map<string, PooledTerminal>();
  private maxSize: number;
  private callbacks: PoolCallbacks;
  private currentlyAttachedId: string | null = null;

  constructor(maxSize: number, callbacks: PoolCallbacks) {
    this.maxSize = maxSize;
    this.callbacks = callbacks;
  }

  /** Get or create a pooled terminal. Updates LRU time. Evicts if needed. */
  acquire(
    id: string,
    sessionId: string,
    nodeId: string,
    color: string,
    isShell: boolean
  ): PooledTerminal {
    const existing = this.pool.get(id);
    if (existing) {
      existing.lastAccessTime = Date.now();
      return existing;
    }

    // Evict LRU if pool is full
    while (this.pool.size >= this.maxSize) {
      this._evictLRU();
    }

    const entry = this._createTerminal(id, sessionId, nodeId, color, isShell);
    this.pool.set(id, entry);
    return entry;
  }

  /** Remove from pool, saving snapshot and disposing everything. */
  release(id: string): void {
    const entry = this.pool.get(id);
    if (!entry) return;
    this._dispose(entry);
    this.pool.delete(id);
    if (this.currentlyAttachedId === id) {
      this.currentlyAttachedId = null;
    }
  }

  /** Show terminal in the mount point (hide others). */
  attachTo(id: string, mountPoint: HTMLDivElement): void {
    const entry = this.pool.get(id);
    if (!entry) return;

    // Hide previous terminal
    if (this.currentlyAttachedId && this.currentlyAttachedId !== id) {
      const prev = this.pool.get(this.currentlyAttachedId);
      if (prev) prev.container.style.display = "none";
    }

    // Ensure container is in the mount point (first time only)
    if (!entry.container.parentNode) {
      entry.container.style.display = "none";
      mountPoint.appendChild(entry.container);
    }

    // Show this terminal
    entry.container.style.display = "";
    this.currentlyAttachedId = id;

    // Reset scroll tracking — user expects to see latest output
    entry.userScrolledUp = false;
    entry.term.scrollToBottom();
    entry.term.focus();

    // Fit in case sidebar width changed since last view
    requestAnimationFrame(() => {
      if (!entry.alive) return;
      try {
        entry.fitAddon.fit();
      } catch {}

      if (entry.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify({
          type: "resize",
          cols: entry.term.cols,
          rows: entry.term.rows,
        }));
      }
    });
  }

  /** Hide terminal (stays in DOM, stays alive). */
  detach(id: string): void {
    const entry = this.pool.get(id);
    if (!entry) return;
    entry.container.style.display = "none";
    if (this.currentlyAttachedId === id) {
      this.currentlyAttachedId = null;
    }
  }

  /** Detach all terminals. */
  detachAll(): void {
    for (const [id] of this.pool) {
      this.detach(id);
    }
  }

  /** Refit all pooled terminals (e.g., on window resize). */
  resize(): void {
    for (const [, entry] of this.pool) {
      if (!entry.alive) continue;
      try {
        entry.fitAddon.fit();
      } catch {}
      if (entry.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify({
          type: "resize",
          cols: entry.term.cols,
          rows: entry.term.rows,
        }));
      }
    }
  }

  /** Check if a terminal is in the pool. */
  has(id: string): boolean {
    return this.pool.has(id);
  }

  /** Dispose everything (app unmount). */
  destroy(): void {
    for (const [id] of this.pool) {
      this.release(id);
    }
  }

  // --- Private ---

  private _createTerminal(
    id: string,
    sessionId: string,
    nodeId: string,
    color: string,
    isShell: boolean
  ): PooledTerminal {
    // Create off-screen container
    const container = document.createElement("div");
    container.className = "w-full h-full overflow-hidden";
    container.style.cssText = "padding: 12px; background-color: #0d0d0d; min-height: 200px; box-sizing: border-box;";

    // Create xterm
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 12,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace',
      fontWeight: "400",
      lineHeight: 1.4,
      letterSpacing: 0,
      theme: { ...TERMINAL_THEME, cursor: color },
      allowProposedApi: true,
      scrollback: 7500,
    });

    // Load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const serializeAddon = new SerializeAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(serializeAddon);

    // Open terminal into the off-screen container
    term.open(container);

    // Initial fit
    try { fitAddon.fit(); } catch {}

    // GPU-accelerated rendering
    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose();
        webglAddon = null;
        entry.webglAddon = null;
      });
      term.loadAddon(webglAddon);
    } catch {
      webglAddon = null;
    }

    // Reset attributes and show cursor
    term.write("\x1b[0m\x1b[?25h");

    const entry: PooledTerminal = {
      id,
      sessionId,
      nodeId,
      color,
      isShell,
      term,
      fitAddon,
      serializeAddon,
      webglAddon,
      container,
      ws: null,
      wsReconnectTimer: null,
      lastSeq: 0,
      committedSeq: 0,
      lastAccessTime: Date.now(),
      userScrolledUp: false,
      cacheTimeout: null,
      resizeObserver: null,
      alive: true,
    };

    // Drop legacy snapshot keys
    clearLegacySnapshot(sessionId);

    // Restore from cache
    const snapshot = readSnapshot(sessionId, term.cols);
    let restoredFromCache = false;
    if (snapshot) {
      entry.lastSeq = snapshot.seq;
      entry.committedSeq = snapshot.seq;
      restoredFromCache = true;
    }

    // Set up input handler
    term.onData((data) => {
      if (entry.ws?.readyState === WebSocket.OPEN) {
        const filtered = data.replace(/\x1b\[\d+;\d+R/g, "");
        if (filtered) {
          entry.ws.send(JSON.stringify({ type: "input", data: filtered }));
        }
      }
    });

    // Set up resize observer on container
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (!entry.alive || container.clientWidth === 0 || container.clientHeight === 0) return;

        const wasAtBottom = term.buffer.active.viewportY >= term.buffer.active.baseY;
        try { fitAddon.fit(); } catch {}
        if (wasAtBottom) term.scrollToBottom();

        if (entry.ws?.readyState === WebSocket.OPEN) {
          entry.ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      }, 150);
    });
    resizeObserver.observe(container);
    entry.resizeObserver = resizeObserver;

    // Set up wheel handler for scroll tracking
    container.addEventListener("wheel", (e: WheelEvent) => {
      if (e.deltaY < 0) {
        entry.userScrolledUp = true;
      } else if (e.deltaY > 0) {
        requestAnimationFrame(() => {
          if (!entry.alive) return;
          if (term.buffer.active.viewportY >= term.buffer.active.baseY) {
            entry.userScrolledUp = false;
          }
        });
      }
    }, { passive: true });

    // Connect WebSocket — parallel with snapshot restore
    if (snapshot) {
      // Buffer messages until snapshot write completes
      const messageBuffer: MessageEvent[] = [];
      let snapshotWritten = false;

      // Start WS immediately (parallel)
      this._connectWs(entry, restoredFromCache, (event) => {
        if (!snapshotWritten) {
          messageBuffer.push(event);
        } else {
          // After snapshot is written, first message already consumed by buffer flush
          // so we go straight to live handling
          this._handleLiveWsMessage(entry, event);
        }
      });

      // Write snapshot content
      term.write(snapshot.content, () => {
        if (entry.alive) {
          term.scrollToBottom();
          term.focus();
        }
        snapshotWritten = true;
        // Flush buffered messages — the first one gets first-message treatment
        let firstFlushed = false;
        for (const msg of messageBuffer) {
          if (!firstFlushed) {
            firstFlushed = true;
            this._handleFirstWsMessage(entry, msg, restoredFromCache);
          } else {
            this._handleLiveWsMessage(entry, msg);
          }
        }
        messageBuffer.length = 0;
      });
    } else {
      // No cache — connect immediately
      this._connectWs(entry, restoredFromCache);
    }

    return entry;
  }

  private _connectWs(
    entry: PooledTerminal,
    restoredFromCache: boolean,
    messageInterceptor?: (event: MessageEvent) => void
  ): void {
    if (!entry.alive) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsBase = `${protocol}//${window.location.host}/ws?sessionId=${entry.sessionId}`;
    const ws = new WebSocket(`${wsBase}&lastSeq=${entry.committedSeq}`);
    entry.ws = ws;

    // Per-connection first-message tracking via closure
    let isFirstMessage = true;

    ws.onopen = () => {
      // Send current dimensions (no fit() here, just send dims)
      if (entry.alive) {
        ws.send(JSON.stringify({
          type: "resize",
          cols: entry.term.cols,
          rows: entry.term.rows,
        }));
      }
    };

    ws.onmessage = messageInterceptor || ((event) => {
      if (isFirstMessage) {
        isFirstMessage = false;
        this._handleFirstWsMessage(entry, event, restoredFromCache);
      } else {
        this._handleLiveWsMessage(entry, event);
      }
    });

    ws.onerror = () => {};

    ws.onclose = () => {
      // Auto-reconnect after 2s if still alive
      if (entry.alive) {
        entry.wsReconnectTimer = setTimeout(() => {
          if (entry.alive) {
            this._connectWs(entry, true); // always use delta on reconnect
          }
        }, 2000);
      }
    };
  }

  /** Handle the first message from a new WebSocket connection. */
  private _handleFirstWsMessage(
    entry: PooledTerminal,
    event: MessageEvent,
    restoredFromCache: boolean
  ): void {
    if (!entry.alive) return;

    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "output") {
        if (msg.seq !== undefined) {
          entry.lastSeq = msg.seq;
        }

        if (restoredFromCache && (!msg.data || msg.data.length === 0)) {
          // Cache hit — already displaying
          entry.committedSeq = entry.lastSeq;
          entry.term.focus();
        } else if (restoredFromCache && msg.isDelta && msg.data) {
          // Delta replay — append missed output
          const seqAtWrite = entry.lastSeq;
          entry.term.write(msg.data, () => {
            if (entry.alive) {
              entry.committedSeq = seqAtWrite;
              entry.term.scrollToBottom();
              entry.term.focus();
              this._scheduleCacheSave(entry);
            }
          });
        } else if (msg.data && msg.data.length > 0) {
          // Full buffer — clear and render fresh
          entry.term.clear();
          entry.term.write("\x1b[2J\x1b[H\x1b[0m\x1b[?25h");
          const seqAtWrite = entry.lastSeq;
          entry.term.write(msg.data, () => {
            if (entry.alive) {
              entry.committedSeq = seqAtWrite;
              entry.term.scrollToBottom();
              entry.term.focus();
              this._scheduleCacheSave(entry);
            }
          });
        } else {
          // No cache, no buffer — empty terminal
          entry.term.write("\x1b[?25h");
          entry.term.focus();
        }
      } else {
        // Non-output first message — delegate to common handler
        this._handleNonOutputMessage(entry, msg);
      }
    } catch {
      entry.term.write(event.data);
    }
  }

  /** Handle all messages after the first from a WebSocket connection. */
  private _handleLiveWsMessage(
    entry: PooledTerminal,
    event: MessageEvent
  ): void {
    if (!entry.alive) return;

    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "output") {
        if (msg.seq !== undefined) {
          entry.lastSeq = msg.seq;
        }

        if (msg.data) {
          const seqAtWrite = entry.lastSeq;
          entry.term.write(msg.data, () => {
            entry.committedSeq = seqAtWrite;
          });
          if (!entry.userScrolledUp && entry.alive) {
            requestAnimationFrame(() => {
              if (entry.alive && !entry.userScrolledUp) {
                entry.term.scrollToBottom();
              }
            });
          }
          this._scheduleCacheSave(entry);
        }
      } else {
        this._handleNonOutputMessage(entry, msg);
      }
    } catch {
      entry.term.write(event.data);
    }
  }

  /** Handle status, auth, and other non-output message types. */
  private _handleNonOutputMessage(
    entry: PooledTerminal,
    msg: any
  ): void {
    if (msg.type === "status" && !entry.isShell) {
      this.callbacks.onStatusUpdate(entry.nodeId, {
        status: msg.status,
        isRestored: msg.isRestored,
        currentTool: msg.currentTool,
        ...(msg.gitBranch ? { gitBranch: msg.gitBranch } : {}),
        longRunningTool: msg.longRunningTool || false,
        ...(msg.model ? { model: msg.model } : {}),
        sleepEndTime: msg.sleepEndTime,
      });
    } else if (msg.type === "auth_required") {
      this.callbacks.onAuthRequired(msg.url);
    } else if (msg.type === "auth_complete") {
      this.callbacks.onAuthClear();
    }
  }

  private _scheduleCacheSave(entry: PooledTerminal): void {
    if (entry.cacheTimeout) clearTimeout(entry.cacheTimeout);
    entry.cacheTimeout = setTimeout(() => {
      if (!entry.alive) return;
      entry.term.write("", () => {
        if (!entry.alive) return;
        try {
          const serialized = entry.serializeAddon.serialize();
          writeSnapshot(entry.sessionId, {
            content: serialized,
            seq: entry.committedSeq,
            cols: entry.term.cols,
            rows: entry.term.rows,
          });
        } catch {}
      });
    }, 500);
  }

  private _evictLRU(): void {
    let oldest: PooledTerminal | null = null;
    for (const [, entry] of this.pool) {
      // Never evict the currently attached terminal
      if (entry.id === this.currentlyAttachedId) continue;
      if (!oldest || entry.lastAccessTime < oldest.lastAccessTime) {
        oldest = entry;
      }
    }
    if (oldest) {
      this.release(oldest.id);
    }
  }

  private _dispose(entry: PooledTerminal): void {
    entry.alive = false;

    // Save snapshot before disposing
    try {
      const serialized = entry.serializeAddon.serialize();
      writeSnapshot(entry.sessionId, {
        content: serialized,
        seq: entry.committedSeq,
        cols: entry.term.cols,
        rows: entry.term.rows,
      });
    } catch {}

    // Clear timers
    if (entry.cacheTimeout) clearTimeout(entry.cacheTimeout);
    if (entry.wsReconnectTimer) clearTimeout(entry.wsReconnectTimer);

    // Disconnect
    entry.resizeObserver?.disconnect();
    entry.ws?.close();

    // Dispose WebGL before terminal
    try { entry.webglAddon?.dispose(); } catch {}
    entry.webglAddon = null;
    entry.term.dispose();

    // Remove container from DOM if attached
    if (entry.container.parentNode) {
      entry.container.parentNode.removeChild(entry.container);
    }
  }
}
