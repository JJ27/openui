# OpenUI

Visual canvas for managing AI coding agents locally.

Stop juggling terminal windows. Manage Claude Code and OpenCode agents on an infinite canvas.

## Installation

```bash
# Run directly
npx @fallomai/openui

# Or with bun
bunx openui
```

## What It Does

OpenUI gives you a visual workspace where each AI agent (Claude Code, OpenCode) is a node on a canvas. Click a node to interact with its terminal. See all agent states at a glance.

**Features:**
- Infinite canvas for organizing multiple AI agents
- Real-time status indicators (running, idle, waiting for input, tool calling)
- Integrated terminal emulation (xterm.js)
- Session persistence across restarts
- Custom names, colors, and icons per agent
- WebSocket-based communication for live updates

## Usage

1. Run `npx @fallomai/openui` in your project directory
2. Browser opens automatically at `http://localhost:6969`
3. Click "+" to spawn a new agent (Claude Code or OpenCode)
4. Click any node to open its terminal
5. Drag nodes to organize your workspace
6. Click the edit icon to customize name, color, or icon

## How It Works

OpenUI runs a local server that:
- Spawns PTY sessions for each agent
- Tracks agent state via JSON events (Claude Code) or pattern matching (OpenCode)
- Streams terminal I/O over WebSocket
- Persists canvas layout and session data to `~/.openui/`

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono + WebSockets + bun-pty
- **Frontend**: React + React Flow + xterm.js
- **State**: Zustand

## Development

```bash
git clone https://github.com/Fallomai/openui.git
cd openui

bun install
cd client && bun install && cd ..

bun run dev  # Server on 6968, UI on 6969
```

## Requirements

- Bun 1.0+
- Claude Code or OpenCode installed locally

## License

MIT
