/**
 * Session Start Queue
 *
 * Serializes Claude agent starts to prevent OAuth port contention.
 * When multiple Claude instances start simultaneously, they all try to bind
 * port 8020 for OAuth callback. This queue ensures only one starts at a time,
 * using the SessionStart plugin hook as the "ready" signal.
 *
 * OAuth detection: monitors each session's PTY output for OAuth URLs.
 * If detected, the queue pauses indefinitely (no timeout) until auth completes.
 */

import { getAutoResumeConfig } from "./autoResume";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

interface PendingStart {
  sessionId: string;
  resolve: () => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  waitingForAuth?: boolean;
  oauthCheckInterval?: ReturnType<typeof setInterval>;
}

interface QueueEntry {
  sessionId: string;
  startFn: () => void;
  getOutputBuffer?: () => string[];
}

let currentPending: PendingStart | null = null;
const queue: QueueEntry[] = [];
let processing = false;

// Progress tracking for UI
let totalEnqueued = 0;
let completedCount = 0;
let currentSessionId: string | null = null;

// Broadcast callbacks (set by index.ts)
let onAuthRequired: ((url: string) => void) | null = null;
let onAuthComplete: (() => void) | null = null;

/**
 * Set broadcast callbacks for auth events.
 * Called once from index.ts after server is set up.
 */
export function setAuthBroadcast(
  required: (url: string) => void,
  complete: () => void,
): void {
  onAuthRequired = required;
  onAuthComplete = complete;
}

export function getQueueProgress() {
  return {
    total: totalEnqueued,
    completed: completedCount,
    current: currentSessionId,
    isActive: processing,
  };
}

export function resetQueueProgress() {
  totalEnqueued = 0;
  completedCount = 0;
  currentSessionId = null;
}

/**
 * Enqueue a Claude agent start. The startFn will be called when it's
 * this session's turn. The queue advances when signalSessionReady()
 * is called or the timeout expires.
 *
 * @param getOutputBuffer - Optional callback returning the session's output buffer.
 *   Used to detect OAuth URLs in PTY output and pause the queue.
 */
export function enqueueSessionStart(
  sessionId: string,
  startFn: () => void,
  getOutputBuffer?: () => string[],
): void {
  queue.push({ sessionId, startFn, getOutputBuffer });
  totalEnqueued++;
  if (!processing) {
    processQueue();
  }
}

/**
 * Signal that a session has finished its startup (OAuth complete).
 * Called from the /api/status-update handler on SessionStart hook events.
 */
export function signalSessionReady(sessionId: string): void {
  if (!currentPending || currentPending.sessionId !== sessionId) return;

  clearTimeout(currentPending.timeoutHandle);
  if (currentPending.oauthCheckInterval) {
    clearInterval(currentPending.oauthCheckInterval);
  }

  const wasWaitingForAuth = currentPending.waitingForAuth;
  log(`\x1b[38;5;82m[start-queue]\x1b[0m Session ${sessionId} signaled ready${wasWaitingForAuth ? " (auth complete)" : ""}`);

  // Notify clients that auth is done
  if (wasWaitingForAuth && onAuthComplete) {
    onAuthComplete();
  }

  const config = getAutoResumeConfig();
  const delay = config.postSignalDelayMs ?? 2000;

  // Wait a short delay after signal for port 8020 to fully release
  const pending = currentPending;
  currentPending = null;
  setTimeout(() => {
    pending.resolve();
  }, delay);
}

// Pattern to detect OAuth URLs in PTY output
const OAUTH_PATTERN = /localhost[:\s]*8020|port 8020/i;
const URL_PATTERN = /https?:\/\/\S+/;

/**
 * Start polling a session's output buffer for OAuth URL patterns.
 * If detected, clears the timeout so the queue waits indefinitely for auth.
 */
function startOAuthDetection(
  pending: PendingStart,
  getOutputBuffer: () => string[],
): void {
  let lastCheckedIndex = 0;

  const checkInterval = setInterval(() => {
    const buffer = getOutputBuffer();
    // Only check new output since last check
    for (let i = lastCheckedIndex; i < buffer.length; i++) {
      if (OAUTH_PATTERN.test(buffer[i])) {
        clearInterval(checkInterval);
        pending.oauthCheckInterval = undefined;

        // Clear the normal timeout — wait indefinitely for auth
        clearTimeout(pending.timeoutHandle);
        pending.waitingForAuth = true;
        log(`\x1b[38;5;208m[start-queue]\x1b[0m OAuth detected for ${pending.sessionId}, pausing queue until auth completes`);

        // Extract URL and broadcast to clients
        const recentOutput = buffer.slice(Math.max(0, i - 2), i + 3).join("");
        const urlMatch = recentOutput.match(URL_PATTERN);
        if (urlMatch && onAuthRequired) {
          onAuthRequired(urlMatch[0]);
        }
        return;
      }
    }
    lastCheckedIndex = buffer.length;
  }, 500);

  pending.oauthCheckInterval = checkInterval;

  // Stop checking after 10 seconds if no OAuth detected
  setTimeout(() => {
    if (pending.oauthCheckInterval === checkInterval) {
      clearInterval(checkInterval);
      pending.oauthCheckInterval = undefined;
    }
  }, 10000);
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const next = queue.shift()!;
    currentSessionId = next.sessionId;
    log(`\x1b[38;5;141m[start-queue]\x1b[0m Starting ${next.sessionId} (${queue.length} remaining in queue)`);

    await new Promise<void>((resolve) => {
      const config = getAutoResumeConfig();
      const timeout = config.startupTimeoutMs ?? 30000;

      const timeoutHandle = setTimeout(() => {
        log(`\x1b[38;5;208m[start-queue]\x1b[0m Timeout waiting for ${next.sessionId} (${timeout}ms), proceeding`);
        if (currentPending?.oauthCheckInterval) {
          clearInterval(currentPending.oauthCheckInterval);
        }
        currentPending = null;
        resolve();
      }, timeout);

      currentPending = {
        sessionId: next.sessionId,
        resolve,
        timeoutHandle,
      };

      // Actually start the session
      try {
        next.startFn();

        // Start OAuth detection if we have access to the output buffer
        if (next.getOutputBuffer && currentPending) {
          startOAuthDetection(currentPending, next.getOutputBuffer);
        }
      } catch (error) {
        log(`\x1b[38;5;208m[start-queue]\x1b[0m startFn threw for ${next.sessionId}: ${error}`);
        clearTimeout(timeoutHandle);
        if (currentPending?.oauthCheckInterval) {
          clearInterval(currentPending.oauthCheckInterval);
        }
        currentPending = null;
        resolve();
      }
    });

    completedCount++;
  }

  processing = false;
  currentSessionId = null;
}
