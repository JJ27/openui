import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const COST_CACHE_PATH = join(homedir(), ".claude", "cost_cache.json");
const CACHE_TTL = 10_000; // 10 seconds

let cachedSessions: Record<string, { tokens?: number; cost?: number }> = {};
let lastReadTime = 0;

function refreshCache() {
  const now = Date.now();
  if (now - lastReadTime < CACHE_TTL) return;
  lastReadTime = now;

  try {
    if (!existsSync(COST_CACHE_PATH)) return;
    const raw = readFileSync(COST_CACHE_PATH, "utf8");
    const data = JSON.parse(raw);
    cachedSessions = data.sessions || {};
  } catch {
    // File may be mid-write or corrupted — keep stale cache
  }
}

export function getTokensForSession(claudeSessionId: string | undefined): number | null {
  if (!claudeSessionId) return null;
  refreshCache();
  const entry = cachedSessions[claudeSessionId];
  return entry?.tokens ?? null;
}
