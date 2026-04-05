# Claude Code Kanban

![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.85.0-blue?logo=visualstudiocode)
![License](https://img.shields.io/badge/license-MIT-green)

A read-only Kanban board for visualizing Claude Code agent tasks inside VS Code.

## Features

- **3-Column Kanban Board** -- Pending, In Progress, and Completed columns with task counts and color-coded accents
- **Live Updates** -- File watcher automatically refreshes the board when tasks change on disk
- **Team Member Display** -- Shows team members with deterministically assigned animal emoji icons
- **VS Code Theme Integration** -- Adapts to your current light or dark theme via CSS variables
- **Configurable Task Directory** -- Override the default `~/.claude/tasks/` path in settings
- **Team Selector** -- Switch between multiple teams with a quick pick menu

## Installation

```bash
git clone https://github.com/ericf/claude-kanban.git
cd claude-kanban
npm install
npm run compile
```

To install locally, symlink into your VS Code extensions directory:

```bash
npm run install-ext
```

Or package as a `.vsix`:

```bash
npx vsce package
code --install-extension claude-kanban-0.1.0.vsix
```

## Usage

Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run:

```
Claude: Open Claude Kanban Board
```

If multiple teams are detected, you'll be prompted to select one. The board updates automatically as task files change.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `claude-kanban.tasksDirectory` | `~/.claude/tasks` (auto-detected) | Path to the Claude Code tasks directory |
| `claude-kanban.teamsDirectory` | `~/.claude/teams` (auto-detected) | Path to the Claude Code teams directory |

## How It Works

The extension reads Claude Code task JSON files from `~/.claude/tasks/` and team configuration files from `~/.claude/teams/`. Each task has a status (`pending`, `in_progress`, or `completed`), an owner, and optional dependency information (`blocks`/`blockedBy`). A file system watcher monitors the task directory for changes and pushes updates to the webview in real time.

## Development

```bash
npm run watch    # Recompile on file changes
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

## License

MIT
