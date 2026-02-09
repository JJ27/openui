# OpenUI

**Your AI Agent Command Center**

Manage multiple AI coding agents working in parallel on an infinite canvas. See what each agent is working on, their status, and jump in when they need help.

## The Problem

You want to run 8 Claude agents simultaneously - each working on different tasks, in isolated branches. But:
- Terminal tabs are chaos
- You can't see who's stuck at a glance
- Context switching is painful
- No way to organize by project/team

## The Solution

OpenUI gives you a visual command center where each agent is a node on a canvas:

- **At-a-glance status**: Header shows counts of working agents, agents needing input, and idle agents
- **GitHub integration**: Start sessions from GitHub issues with automatic branch creation
- **Branch isolation**: Each agent works in its own git worktree
- **Organized workspace**: Tabs, custom colors, drag-and-drop layout
- **Auto-resume**: Sessions automatically restore on restart
- **Archive management**: Archive completed sessions while keeping your workspace clean

## Installation

### Prerequisites
- **Bun** (v1.0+) - Install with: `curl -fsSL https://bun.sh/install | bash`
- **Claude Code** - Available via `llm agent claude` (Databricks) or `claude` (public)
  - For Databricks: Already installed on dev machines
  - For public: Install from [claude.com/claude-code](https://claude.com/claude-code)

### Setup

```bash
git clone https://github.com/JJ27/openui.git
cd openui
bun install && cd client && bun install && cd ..
bun link
```

### Run

From any project directory:

```bash
cd ~/your-project
openui
```

The first run will automatically build the client. Open `http://localhost:6969` in your browser.

If you're on a remote dev machine, forward port 6969 to access the UI locally.

## Updating

OpenUI auto-updates on startup. When you run `openui`, it will:
1. Check for new commits on `origin/main`
2. Pull changes automatically (fast-forward only)
3. Rebuild the UI if source code changed

No need to re-run `bun link` after updates - the symlink points to the repo directory.

If auto-update fails (e.g. you have local changes), update manually:

```bash
cd /path/to/openui
git pull
openui  # will auto-rebuild
```

To skip auto-update: `openui --no-update`

## Quick Start

1. Run `openui` in your project directory
2. Open `http://localhost:6969` in your browser
3. Click "+" to spawn agents (Claude Code, OpenCode, or Ralph Loop)
4. Click any node to open its terminal
5. Drag nodes to organize, create tabs to group them

## Features

### Canvas Management
- **Infinite canvas** for organizing agents with drag-and-drop positioning
- **Tabs**: Create multiple canvases to organize agents by project, team, or workflow
- **Custom styling**: Set custom names, colors, and icons per agent
- **Persistent layout**: All positions and organization saved across restarts

### Agent Monitoring
- **Real-time status**: Running, Idle, Needs Input, Tool Calling, Disconnected
- **Git integration**: Branch and repo info displayed on each node
- **Directory tracking**: See working directory per agent

### Session Management
- **Auto-resume**: Sessions automatically restore on server restart with proper state
- **Manual resume**: Resume disconnected sessions with preserved context
- **Session persistence**: All sessions saved to `~/.openui/state.json` (centralized in home directory)
- **Archive/Unarchive**: Archive completed sessions to keep workspace clean while preserving full history. Toggle archive view to see archived sessions and unarchive them to restore

### GitHub Integration
- Start sessions directly from GitHub issues
- Auto-create isolated branches per issue
- Git worktree support for parallel work on different issues
- Issue info (ID, title) displayed on agent nodes
- Issue URL linking

### Claude Code Plugin (Auto-installed)

OpenUI automatically installs a Claude Code plugin that provides:
- **Precise status tracking**: Detect Working, Using Tools, Idle, Waiting for Input via hooks
- **Session ID capture**: Enables proper session resume with `--resume <session_id>`
- **Status updates**: WebSocket-based real-time status updates to OpenUI

No manual installation required - just run `openui` and the plugin is set up automatically.

See [claude-code-plugin/README.md](./claude-code-plugin/README.md) for more details.

## How It Works

```
┌─────────────────────────────────────────────────────┐
│                   OpenUI Canvas                      │
│  ┌─ Tab: Frontend ─┐  ┌─ Tab: Backend ─┐            │
│  │                  │  │                 │            │
│  │  ┌─────────┐    │  │  ┌─────────┐   │            │
│  │  │ Agent 1 │    │  │  │ Agent 3 │   │            │
│  │  │ #123    │    │  │  │  IDLE   │   │            │
│  │  │ Working │    │  │  └─────────┘   │            │
│  │  └─────────┘    │  │                 │            │
│  │                  │  └─────────────────┘            │
│  │  ┌─────────┐    │                                  │
│  │  │ Agent 2 │    │                                  │
│  │  │ #124    │    │                                  │
│  │  │ Waiting │    │                                  │
│  │  └─────────┘    │                                  │
│  │                  │                                  │
│  └──────────────────┘                                 │
└─────────────────────────────────────────────────────┘
```

OpenUI runs a local server that:
- Spawns PTY sessions for each AI agent
- Tracks agent state via Claude Code plugin hooks
- Streams terminal I/O over WebSocket
- Persists everything to `~/.openui/` (centralized state in home directory)
- Auto-resumes sessions on restart with proper state

### Agent Commands

By default, OpenUI uses `llm agent claude` to spawn Claude Code instances. This works seamlessly with:
- Session resume via `--resume <session_id>`
- Plugin injection via `--plugin-dir`
- All standard Claude Code features

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono + WebSockets + bun-pty
- **Frontend**: React + React Flow + xterm.js + Framer Motion
- **State**: Zustand
- **Terminal**: xterm.js with fit addon and web links

## Project Structure

```
openui/
├── bin/              # CLI entry point (openui command)
├── server/           # Backend (Hono + WebSocket + PTY management)
│   ├── routes/       # API routes
│   ├── services/     # Session, persistence, auto-resume logic
│   └── types/        # TypeScript types
├── client/           # Frontend (React + React Flow)
│   └── src/
│       ├── components/  # React components
│       ├── stores/      # Zustand state management
│       └── App.tsx
└── claude-code-plugin/  # Claude Code plugin for status tracking

~/.openui/            # Runtime data (created in home directory)
├── state.json        # Persisted sessions and canvas state
├── buffers/          # Session output buffers
├── .build-commit     # Git hash of last successful client build
└── claude-code-plugin/  # Auto-installed plugin
```

## Development

For contributors working on OpenUI itself:

```bash
bun run dev  # Starts Vite HMR + server watch mode on port 6969
```

This runs Vite (hot module reload) and the server in watch mode concurrently. Changes to client code update instantly; server restarts on file changes.

### Testing with the Claude Code Plugin

For development, OpenUI automatically loads the plugin from the repo's `claude-code-plugin/` directory if present. Just run `bun run dev` and the plugin will be injected when spawning Claude agents.

You can also test manually:
```bash
llm agent claude --plugin-dir $(pwd)/claude-code-plugin
```

### Optional: Ralph Loop

[Ralph](https://github.com/frankbria/ralph-claude-code) is an autonomous development loop that runs Claude Code repeatedly until all tasks are complete. To use it with OpenUI:

```bash
# Install Ralph globally
git clone https://github.com/frankbria/ralph-claude-code.git
cd ralph-claude-code
./install.sh

# In your project, set up Ralph
cd your-project
ralph-setup .

# Then select "Ralph Loop" when creating an agent in OpenUI
```

Ralph includes rate limiting, circuit breakers, and intelligent exit detection to prevent runaway loops.

## Configuration

### Git Worktrees

When starting sessions from GitHub issues, OpenUI can automatically create git worktrees for branch isolation:

- Each issue gets its own worktree in `../<repo>-worktrees/<branch-name>/`
- Agents work independently without affecting your main worktree

## Troubleshooting

### Sessions show "disconnected"
- Check that `llm agent claude` works in your terminal
- Ensure the Claude Code plugin is installed (should be automatic)
- Click the "Resume" button to restart the session

### Port already in use
- Change the port: `PORT=7000 openui`
- Or kill the process using port 6969

### Plugin not working
- Delete `~/.openui/claude-code-plugin/` and restart OpenUI to reinstall
- Check plugin logs in the terminal output

### UI looks outdated after `git pull`
- Just run `openui` again - it auto-detects source changes and rebuilds
- Or manually: `cd /path/to/openui && bun run build`

## License

MIT
