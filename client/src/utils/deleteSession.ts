import { useStore } from "../stores/useStore";

export async function deleteSessionWithCleanup(
  nodeId: string,
  sessionId: string,
  cleanup: { deleteLocalBranch: boolean; deleteRemoteBranch: boolean }
): Promise<void> {
  if (cleanup.deleteLocalBranch || cleanup.deleteRemoteBranch) {
    await fetch(`/api/sessions/${sessionId}/cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleanup),
    });
  }

  const nodeTabs = useStore.getState().shellTabs.get(nodeId);
  if (nodeTabs) {
    for (const tab of nodeTabs) {
      fetch(`/api/shell/${tab.shellId}`, { method: "DELETE" }).catch(() => {});
    }
    useStore.getState().deleteShellTabs(nodeId);
  }

  await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
  useStore.getState().removeSession(nodeId);
  useStore.getState().removeNode(nodeId);
}
