export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  description: string;
}

// Newest first. Only the top 10 are ever shown in the UI.
export const changelog: ChangelogEntry[] = [
  {
    id: "2026-02-25-help-shortcuts",
    date: "2026-02-25",
    title: "Help & Keyboard Shortcuts",
    description:
      "Press ? to see all keyboard shortcuts. Use Cmd+I to jump to the next agent needing input, Cmd+N for a new agent.",
  },
  {
    id: "2026-02-25-compacting-status",
    date: "2026-02-25",
    title: "Compacting Status",
    description:
      'Agent cards now show a "Compacting" status when Claude is summarizing its conversation context.',
  },
  {
    id: "2026-02-24-model-display",
    date: "2026-02-24",
    title: "Model Name on Cards",
    description:
      'Agent cards now show the exact model (e.g. "Sonnet 4.6") instead of generic "claude".',
  },
  {
    id: "2026-02-24-sleep-timer",
    date: "2026-02-24",
    title: "Sleep Timer Countdown",
    description:
      'When an agent runs a sleep command, the card shows a live countdown timer instead of "Needs Input".',
  },
];
