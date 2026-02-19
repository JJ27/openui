import { spawnSync } from "bun";
import { spawn as spawnPty } from "bun-pty";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Session } from "../types";
import { loadBuffer } from "./persistence";
import { enqueueSessionStart, signalSessionReady } from "./sessionStartQueue";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);
const logError = QUIET ? () => {} : console.error.bind(console);

// Detect available CLI at startup
const HAS_ISAAC = spawnSync(["which", "isaac"], { stdout: "pipe", stderr: "pipe" }).exitCode === 0;
export const DEFAULT_CLAUDE_COMMAND = HAS_ISAAC ? "isaac claude" : "llm agent claude";
log(`\x1b[38;5;141m[cli]\x1b[0m Detected CLI: ${DEFAULT_CLAUDE_COMMAND} (isaac ${HAS_ISAAC ? "found" : "not found"})`);

// Get the OpenUI plugin directory path
function getPluginDir(): string | null {
  // Check for plugin in ~/.openui/claude-code-plugin (installed via curl)
  const homePluginDir = join(homedir(), ".openui", "claude-code-plugin");
  const homePluginJson = join(homePluginDir, ".claude-plugin", "plugin.json");
  log(`\x1b[38;5;245m[plugin-check]\x1b[0m Checking home: ${homePluginJson} exists=${existsSync(homePluginJson)}`);
  if (existsSync(homePluginJson)) {
    return homePluginDir;
  }

  // Check for plugin in the openui repo (for development)
  // Use import.meta.dir for ESM compatibility
  const currentDir = import.meta.dir || __dirname;
  const repoPluginDir = join(currentDir, "..", "..", "claude-code-plugin");
  const repoPluginJson = join(repoPluginDir, ".claude-plugin", "plugin.json");
  log(`\x1b[38;5;245m[plugin-check]\x1b[0m Checking repo: ${repoPluginJson} exists=${existsSync(repoPluginJson)}`);
  if (existsSync(repoPluginJson)) {
    return repoPluginDir;
  }

  log(`\x1b[38;5;245m[plugin-check]\x1b[0m No plugin found`);
  return null;
}

// Inject --plugin-dir flag for Claude commands if plugin is available
export function injectPluginDir(command: string, agentId: string): string {
  if (agentId !== "claude") return command;

  const pluginDir = getPluginDir();
  if (!pluginDir) return command;

  // Check if command already has --plugin-dir
  if (command.includes("--plugin-dir")) return command;

  // Handle "isaac claude", "llm agent claude", and plain "claude" command formats
  const parts = command.split(/\s+/);

  // Check for "isaac claude" format
  if (parts[0] === "isaac" && parts[1] === "claude") {
    parts.splice(2, 0, `--plugin-dir`, pluginDir);
    const finalCmd = parts.join(" ");
    log(`\x1b[38;5;141m[plugin]\x1b[0m Injecting plugin-dir: ${pluginDir}`);
    log(`\x1b[38;5;141m[plugin]\x1b[0m Final command: ${finalCmd}`);
    return finalCmd;
  }

  // Check for "llm agent claude" format (legacy)
  if (parts[0] === "llm" && parts[1] === "agent" && parts[2] === "claude") {
    parts.splice(3, 0, `--plugin-dir`, pluginDir);
    const finalCmd = parts.join(" ");
    log(`\x1b[38;5;141m[plugin]\x1b[0m Injecting plugin-dir: ${pluginDir}`);
    log(`\x1b[38;5;141m[plugin]\x1b[0m Final command: ${finalCmd}`);
    return finalCmd;
  }

  // Check for plain "claude" format
  if (parts[0] === "claude") {
    parts.splice(1, 0, `--plugin-dir`, pluginDir);
    const finalCmd = parts.join(" ");
    log(`\x1b[38;5;141m[plugin]\x1b[0m Injecting plugin-dir: ${pluginDir}`);
    log(`\x1b[38;5;141m[plugin]\x1b[0m Final command: ${finalCmd}`);
    return finalCmd;
  }

  return command;
}

// Get git branch for a directory
export function getGitBranch(cwd: string): string | null {
  try {
    const result = spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode === 0) {
      return result.stdout.toString().trim();
    }
  } catch {
    // Not a git repo or git not available
  }
  return null;
}


export const MAX_BUFFER_SIZE = 1000;

/** Broadcast a message to all WebSocket clients of a session, with try-catch per client */
export function broadcastToSession(session: Session, message: object) {
  const json = JSON.stringify(message);
  for (const client of session.clients) {
    try {
      if (client.readyState === 1) {
        client.send(json);
      }
    } catch {
      session.clients.delete(client);
    }
  }
}

export const sessions = new Map<string, Session>();

export async function createSession(params: {
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  nodeId: string;
  customName?: string;
  customColor?: string;
  // Ticket and worktree options
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  branchName?: string;
  baseBranch?: string;
  createWorktreeFlag?: boolean;
  prNumber?: string;
  ticketPromptTemplate?: string;
}): Promise<{ session: Session; cwd: string; gitBranch?: string }> {
  const {
    sessionId,
    agentId,
    agentName,
    command,
    cwd: originalCwd,
    nodeId,
    customName,
    customColor,
    ticketId,
    ticketTitle,
    ticketUrl,
    branchName,
    baseBranch,
    createWorktreeFlag,
    prNumber,
    ticketPromptTemplate,
  } = params;

  // Build isaac flags for worktree/branch/PR
  let isaacFlags = "";
  let gitBranch: string | null = null;
  if (agentId === "claude") {
    if (createWorktreeFlag && branchName) {
      // Pre-create branch from baseBranch if the branch doesn't exist yet
      if (baseBranch && HAS_ISAAC) {
        const branchExists = spawnSync(["git", "rev-parse", "--verify", branchName], {
          cwd: originalCwd, stdout: "pipe", stderr: "pipe",
        }).exitCode === 0;
        if (!branchExists) {
          log(`\x1b[38;5;141m[git]\x1b[0m Creating branch "${branchName}" from "${baseBranch}"`);
          spawnSync(["git", "branch", branchName, baseBranch], {
            cwd: originalCwd, stdout: "pipe", stderr: "pipe",
          });
        }
      }
      isaacFlags += ` --worktree --branch "${branchName}"`;
      gitBranch = branchName;
    }
    if (prNumber) {
      isaacFlags += ` --pr ${prNumber}`;
      if (!gitBranch) gitBranch = `PR #${prNumber}`;
    }
  }

  // If not set from flags, detect git branch
  if (!gitBranch) {
    gitBranch = getGitBranch(originalCwd);
  }

  const now = Date.now();
  const session: Session = {
    pty: null as any,
    agentId,
    agentName,
    command,
    cwd: originalCwd,
    gitBranch: gitBranch || undefined,
    createdAt: new Date().toISOString(),
    clients: new Set(),
    outputBuffer: [],
    status: "idle",
    lastOutputTime: now,
    lastInputTime: 0,
    recentOutputSize: 0,
    customName,
    customColor,
    nodeId,
    isRestored: false,
    ticketId,
    ticketTitle,
    ticketUrl,
  };

  sessions.set(sessionId, session);

  // Spawn PTY
  const ptyProcess = spawnPty("/bin/bash", [], {
    name: "xterm-256color",
    cwd: originalCwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      OPENUI_SESSION_ID: sessionId,
    },
    rows: 30,
    cols: 120,
  });

  session.pty = ptyProcess;

  // Output decay
  const resetInterval = setInterval(() => {
    if (!sessions.has(sessionId) || !session.pty) {
      clearInterval(resetInterval);
      return;
    }
    session.recentOutputSize = Math.max(0, session.recentOutputSize - 50);
  }, 500);

  // PTY output handler
  ptyProcess.onData((data: string) => {
    session.outputBuffer.push(data);
    if (session.outputBuffer.length > MAX_BUFFER_SIZE) {
      session.outputBuffer.shift();
    }

    session.lastOutputTime = Date.now();
    session.recentOutputSize += data.length;

    broadcastToSession(session, { type: "output", data });
  });

  // Run the command with plugin-dir and isaac flags
  const finalCommand = injectPluginDir(command, agentId) + isaacFlags;
  log(`\x1b[38;5;82m[pty-write]\x1b[0m Writing command: ${finalCommand}`);

  setTimeout(() => {
    ptyProcess.write(`${finalCommand}\r`);

    // If there's a ticket URL, send it to the agent after a delay
    if (ticketUrl) {
      setTimeout(() => {
        const defaultTemplate = "Here is the ticket for this session: {{url}}\n\nPlease use the Linear MCP tool or fetch the URL to read the full ticket details before starting work.";
        const template = ticketPromptTemplate || defaultTemplate;
        const ticketPrompt = template
          .replace(/\{\{url\}\}/g, ticketUrl)
          .replace(/\{\{id\}\}/g, ticketId || "")
          .replace(/\{\{title\}\}/g, ticketTitle || "");
        ptyProcess.write(ticketPrompt + "\r");
      }, 2000);
    }
  }, 300);

  log(`\x1b[38;5;141m[session]\x1b[0m Created ${sessionId} for ${agentName}${ticketId ? ` (ticket: ${ticketId})` : ""}${isaacFlags ? ` (flags:${isaacFlags})` : ""}`);
  return { session, cwd: originalCwd, gitBranch: gitBranch || undefined };
}

export function deleteSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return false;

  if (session.pty) session.pty.kill();
  sessions.delete(sessionId);
  log(`\x1b[38;5;141m[session]\x1b[0m Killed ${sessionId}`);
  return true;
}

export function restoreSessions() {
  const { loadState } = require("./persistence");
  const state = loadState();

  log(`\x1b[38;5;245m[restore]\x1b[0m Found ${state.nodes.length} saved sessions`);

  for (const node of state.nodes) {
    // Skip archived sessions - they should not be in the active sessions Map
    if (node.archived) {
      log(`[restore] Skipping archived session: ${node.sessionId} (${node.customName})`);
      continue;
    }

    // Migrate command format when isaac is available
    if (HAS_ISAAC && node.command.startsWith("llm agent claude")) {
      const oldCommand = node.command;
      node.command = node.command.replace("llm agent claude", "isaac claude");
      log(`\x1b[38;5;141m[restore]\x1b[0m Migrated command for ${node.sessionId}: ${oldCommand} -> ${node.command}`);
    }

    console.log(`[restore] Loading session: ${node.sessionId} (${node.customName}) archived=${node.archived}`);

    const buffer = loadBuffer(node.sessionId);
    const gitBranch = getGitBranch(node.cwd);

    const session: Session = {
      pty: null,
      agentId: node.agentId,
      agentName: node.agentName,
      command: node.command,
      cwd: node.cwd,
      gitBranch: gitBranch || node.gitBranch || undefined,
      createdAt: node.createdAt,
      clients: new Set(),
      outputBuffer: buffer,
      status: "disconnected",
      lastOutputTime: 0,
      lastInputTime: 0,
      recentOutputSize: 0,
      customName: node.customName,
      customColor: node.customColor,
      notes: node.notes,
      nodeId: node.nodeId,
      isRestored: true,
      autoResumed: node.autoResumed || false,
      claudeSessionId: node.claudeSessionId,
      archived: false,
      canvasId: node.canvasId,
      ticketId: node.ticketId,
      ticketTitle: node.ticketTitle,
      ticketUrl: node.ticketUrl,
    };

    sessions.set(node.sessionId, session);
    log(`\x1b[38;5;245m[restore]\x1b[0m Restored ${node.sessionId} (${node.agentName}) branch: ${gitBranch || 'none'}`);
  }
}

/**
 * Auto-resume sessions on startup (resumes all non-archived sessions)
 */
export function autoResumeSessions() {
  const { getSessionsToResume, getAutoResumeConfig } = require("./autoResume");
  const { saveState } = require("./persistence");

  const config = getAutoResumeConfig();
  if (!config.enabled) {
    log(`\x1b[38;5;141m[auto-resume]\x1b[0m Auto-resume is disabled`);
    return;
  }

  const sessionsToResume = getSessionsToResume();

  if (sessionsToResume.length === 0) {
    log(`\x1b[38;5;141m[auto-resume]\x1b[0m No sessions to auto-resume`);
    return;
  }

  log(`\x1b[38;5;141m[auto-resume]\x1b[0m Auto-resuming ${sessionsToResume.length} sessions...`);

  for (const node of sessionsToResume) {
    const session = sessions.get(node.sessionId);
    if (!session) {
      log(`\x1b[38;5;245m[auto-resume]\x1b[0m Session not found: ${node.sessionId}`);
      continue;
    }

    // Skip if already has a PTY (already running)
    if (session.pty) {
      log(`\x1b[38;5;245m[auto-resume]\x1b[0m Skipping ${node.sessionId} (already running)`);
      continue;
    }

    const startFn = () => {
      try {
        // Spawn a new PTY for this session
        const ptyProcess = spawnPty("/bin/bash", [], {
          name: "xterm-256color",
          cwd: session.cwd,
          env: {
            ...process.env,
            TERM: "xterm-256color",
            OPENUI_SESSION_ID: node.sessionId,
          },
          rows: 30,
          cols: 120,
        });

        session.pty = ptyProcess;
        session.status = "idle";
        session.isRestored = false;
        session.autoResumed = true;

        // Set up PTY data handler
        ptyProcess.onData((data: string) => {
          session.outputBuffer.push(data);
          if (session.outputBuffer.length > MAX_BUFFER_SIZE) {
            session.outputBuffer.shift();
          }

          session.lastOutputTime = Date.now();
          session.recentOutputSize += data.length;

          // Broadcast to all connected clients
          broadcastToSession(session, { type: "output", data });
        });

        // Build the command with resume flag if we have a Claude session ID
        let finalCommand = injectPluginDir(session.command, session.agentId);

        // For Claude sessions with a known claudeSessionId, use --resume to restore the specific session
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (session.agentId === "claude" && session.claudeSessionId && UUID_RE.test(session.claudeSessionId)) {
          // Remove any existing --resume flags first
          finalCommand = finalCommand.replace(/--resume\s+[\w-]+/g, '').replace(/--resume(?=\s|$)/g, '').trim();

          const resumeArg = `--resume ${session.claudeSessionId}`;
          if (finalCommand.includes("isaac claude")) {
            finalCommand = finalCommand.replace("isaac claude", `isaac claude ${resumeArg}`);
          } else if (finalCommand.includes("llm agent claude")) {
            finalCommand = finalCommand.replace("llm agent claude", `llm agent claude ${resumeArg}`);
          } else if (finalCommand.startsWith("claude")) {
            finalCommand = finalCommand.replace(/^claude(\s|$)/, `claude ${resumeArg}$1`);
          }
          log(`\x1b[38;5;141m[auto-resume]\x1b[0m Resuming Claude session: ${session.claudeSessionId}`);
        }

        // Send the command to the PTY after a short delay
        setTimeout(() => {
          ptyProcess.write(`${finalCommand}\r`);
        }, 300);

        log(`\x1b[38;5;141m[auto-resume]\x1b[0m Resumed ${node.sessionId} (${node.agentName})`);
      } catch (error) {
        logError(`\x1b[38;5;141m[auto-resume]\x1b[0m Failed to resume ${node.sessionId}:`, error);
        // Signal ready on failure so the queue isn't blocked
        signalSessionReady(node.sessionId);
      }
    };

    // Claude agents go through the queue to prevent OAuth port contention
    if (session.agentId === "claude") {
      enqueueSessionStart(node.sessionId, startFn, () => session.outputBuffer);
    } else {
      // Non-Claude agents start immediately (no OAuth)
      startFn();
    }
  }

  // Save state to persist autoResumed flag
  saveState(sessions);
  log(`\x1b[38;5;141m[auto-resume]\x1b[0m Auto-resume complete`);
}
