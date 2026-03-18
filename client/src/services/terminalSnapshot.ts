export interface TerminalSnapshot {
  content: string;
  seq: number;
  cols: number;
  rows: number;
}

const snapshotKey = (sessionId: string) => `term-snapshot-${sessionId}`;
const legacyCacheKey = (sessionId: string) => `term-cache-${sessionId}`;
const legacySeqKey = (sessionId: string) => `term-seq-${sessionId}`;

export const inMemorySnapshots = new Map<string, TerminalSnapshot>();

export function isSnapshotCompatible(snapshot: TerminalSnapshot, cols: number): boolean {
  return Number.isFinite(snapshot.seq)
    && snapshot.seq >= 0
    && Number.isFinite(snapshot.cols)
    && snapshot.cols > 0
    && Number.isFinite(snapshot.rows)
    && snapshot.rows > 0
    && snapshot.cols === cols;
}

export function readSnapshot(sessionId: string, cols: number): TerminalSnapshot | null {
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

export function writeSnapshot(sessionId: string, snapshot: TerminalSnapshot): boolean {
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

export function clearLegacySnapshot(sessionId: string) {
  try {
    sessionStorage.removeItem(legacyCacheKey(sessionId));
    sessionStorage.removeItem(legacySeqKey(sessionId));
  } catch {}
}
