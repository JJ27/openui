import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { apiRoutes } from "./routes/api";
import { sessions, restoreSessions, autoResumeSessions } from "./services/sessionManager";
import { saveState, migrateStateToHome } from "./services/persistence";
import { setAuthBroadcast } from "./services/sessionStartQueue";
import type { WebSocketData } from "./types";

const app = new Hono();
const PORT = Number(process.env.PORT) || 6968;
const QUIET = !!process.env.OPENUI_QUIET;

// Conditionally log only in dev mode
const log = QUIET ? () => {} : console.log.bind(console);

// Middleware
app.use("*", cors());

// API Routes
app.route("/api", apiRoutes);

// Serve static files (no-cache on index.html so browser always gets fresh asset references)
app.use("/*", serveStatic({
  root: "./client/dist",
  onFound: (path, c) => {
    if (path.endsWith("index.html")) {
      c.header("Cache-Control", "no-cache");
    }
  },
}));

// Restore sessions BEFORE starting server so API requests find populated sessions Map
const migrationResult = migrateStateToHome();
if (migrationResult.migrated) {
  log(`\x1b[38;5;82m[migration]\x1b[0m Migrated state from ${migrationResult.source}`);
}
restoreSessions();

// WebSocket server
Bun.serve<WebSocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) return new Response("Session ID required", { status: 400 });

      const session = sessions.get(sessionId);
      if (!session) return new Response("Session not found", { status: 404 });

      const upgraded = server.upgrade(req, { data: { sessionId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const { sessionId } = ws.data;
      const session = sessions.get(sessionId);

      if (!session) {
        ws.close(1008, "Session not found");
        return;
      }

      log(`\x1b[38;5;245m[ws]\x1b[0m Connected to ${sessionId}`);
      session.clients.add(ws);

      if (session.outputBuffer.length > 0 && !session.isRestored && session.pty) {
        // Cap history to avoid blocking the event loop with huge JSON.stringify
        // Terminal output full of ANSI escapes can expand 3-5x during JSON encoding
        const MAX_HISTORY_BYTES = 512 * 1024; // 512KB raw → ~1-2MB JSON
        let history = "";
        let totalBytes = 0;
        // Walk backwards to get the most recent output first
        for (let i = session.outputBuffer.length - 1; i >= 0; i--) {
          const chunk = session.outputBuffer[i];
          if (totalBytes + chunk.length > MAX_HISTORY_BYTES) {
            // Take partial from this chunk (the tail end)
            const remaining = MAX_HISTORY_BYTES - totalBytes;
            if (remaining > 0) {
              history = chunk.slice(-remaining) + history;
            }
            break;
          }
          history = chunk + history;
          totalBytes += chunk.length;
        }
        ws.send(JSON.stringify({ type: "output", data: history }));
      } else if (session.isRestored || !session.pty) {
        ws.send(JSON.stringify({
          type: "output",
          data: "\x1b[38;5;245mSession was disconnected.\r\nClick \"Spawn Fresh\" to start a new session.\x1b[0m\r\n"
        }));
      }

      ws.send(JSON.stringify({
        type: "status",
        status: session.status,
        isRestored: session.isRestored,
        currentTool: session.currentTool,
        gitBranch: session.gitBranch,
        longRunningTool: session.longRunningTool || false,
      }));

    },
    message(ws, message) {
      const { sessionId } = ws.data;
      const session = sessions.get(sessionId);
      if (!session) return;

      try {
        const msg = JSON.parse(message.toString());
        switch (msg.type) {
          case "input":
            if (session.pty) {
              session.pty.write(msg.data);
              session.lastInputTime = Date.now();
            }
            break;
          case "resize":
            if (session.pty) {
              session.pty.resize(msg.cols, msg.rows);
            }
            break;
        }
      } catch (e) {
        if (!QUIET) console.error("Error processing message:", e);
      }
    },
    close(ws) {
      const { sessionId } = ws.data;
      const session = sessions.get(sessionId);
      if (session) {
        session.clients.delete(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Disconnected from ${sessionId}`);
      }
    },
  },
});

// Wire up auth broadcast — notify all connected clients when OAuth is needed/complete
function broadcastToAll(message: object) {
  const json = JSON.stringify(message);
  for (const session of sessions.values()) {
    for (const client of session.clients) {
      try {
        if (client.readyState === 1) client.send(json);
      } catch {}
    }
  }
}

setAuthBroadcast(
  (url) => broadcastToAll({ type: "auth_required", url }),
  () => broadcastToAll({ type: "auth_complete" }),
);

// Auto-resume non-archived sessions after a short delay
setTimeout(() => {
  autoResumeSessions();
}, 1000);

log(`\x1b[38;5;141m[server]\x1b[0m Running on http://localhost:${PORT}`);
log(`\x1b[38;5;245m[server]\x1b[0m Launch directory: ${process.env.LAUNCH_CWD || process.cwd()}`);

// Periodic state save
setInterval(() => {
  saveState(sessions);
}, 30000);

// Cleanup on exit
process.on("SIGINT", async () => {
  log("\n\x1b[38;5;245m[server]\x1b[0m Saving state before exit...");
  saveState(sessions);
  for (const [, session] of sessions) {
    if (session.pty) session.pty.kill();
  }
  process.exit(0);
});
