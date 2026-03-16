# OpenUI

Visual command center for managing multiple AI coding agents in parallel on an infinite canvas.

Each agent runs in its own git worktree with real-time status tracking, full terminal access, and automatic session persistence.

![OpenUI Canvas](app-demo.png)

## Quick Start

```bash
# Prerequisites: Claude Code (isaac claude)

# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash
source ~/.zshrc  # or restart your shell

# Install OpenUI
cd ~/universe/openui
bun install && cd client && bun install && cd ..
bun link

# Run from any project directory
cd ~/your-project
openui
# Open http://localhost:6969
```

If on a remote machine (e.g. arca), add port forwarding to your local `~/.ssh/config`:

```
Host arca*
  LocalForward 6969 localhost:6969
```

Then SSH in as usual — `http://localhost:6969` will work in your local browser.

## Features

- **Infinite canvas** — agents displayed as live cards on a ReactFlow canvas with real-time status (working, needs input, idle, error), current tool, git branch, and working directory. Pan, zoom, and drag to organize.
- **Multiple workspaces** — separate canvas tabs for different projects or workflows
- **Git worktree isolation** — each agent gets its own worktree automatically, no merge conflicts between parallel agents
- **Session persistence** — close OpenUI, reboot, come back — all agents resume where they left off with terminal history preserved
- **Real-time status** — Claude Code plugin reports agent state via lifecycle hooks (thinking, using tools, waiting for input, idle)
- **Full terminal access** — click any card to open xterm.js terminal with bidirectional I/O, ANSI colors, clickable links, 10K line scrollback
- **Conversation search** — full-text search across Claude Code history using SQLite FTS5, resume or fork past conversations
- **GitHub integration** — start sessions from issues, auto-create branches, issue info displayed on agent cards
- **Batch spawning** — spin up 1-20 agents at once, queued to avoid OAuth port conflicts
- **Permission detection** — flags agents waiting for permission approval or tool calls running longer than 5 minutes
- **Self-updating** — auto-updates on startup via git pull, choose `stable` or `beta` channel in settings

## Development

```bash
bun run dev  # Vite HMR + server watch mode on port 6969
```

## Project Structure

```
openui/
├── bin/              # CLI entry point
├── server/           # Hono + WebSocket + PTY management
├── client/           # React + React Flow + xterm.js
├── claude-code-plugin/  # Auto-installed status tracking plugin
└── package.json
```

State is persisted to `~/.openui/` (sessions, buffers, plugin).

## Tech Stack

Bun, Hono, React, React Flow, xterm.js, Zustand, Framer Motion

## Troubleshooting

- **Sessions disconnected**: Verify `isaac claude` works, click Resume
- **Port in use**: `PORT=7000 openui`
- **Plugin issues**: Delete `~/.openui/claude-code-plugin/` and restart
- **Auto-update**: Runs on startup via git pull; skip with `--no-update`

## Contact

Maintained by the Mosaic Research team. For questions or feedback, post in [#ai-devtools](https://databricks.slack.com/channels/ai-devtools) or [#ai-dev-hacks](https://databricks.slack.com/channels/ai-dev-hacks).

## Acknowledgements

Based on [OpenUI](https://github.com/JJ27/openui), originally forked from [Fallomai/openui](https://github.com/Fallomai/openui).
