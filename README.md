# Dockpit

A local development environment manager that spins up isolated Docker containers for your projects — each with its own terminal, web preview proxy, and Claude Code built in.

## Prerequisites

- [Bun](https://bun.sh/) (v1.1+)
- [Docker](https://docs.docker.com/get-install/) (running, with socket at `/var/run/docker.sock`)
- [GitHub CLI](https://cli.github.com/) (`gh`) — optional, for cloning from GitHub

## Quick Start

```bash
# Install dependencies
bun install

# Build the dev container image (first time only)
# This builds an Arch Linux image with fish, tmux, Node, Bun, Claude Code, etc.
docker build -t dockpit-devenv:latest docker/

# Start the API and web frontend
bun dev
```

The web UI will be available at **http://localhost:5173** and the API runs on **http://localhost:3001**.

## Creating a Project

1. Open http://localhost:5173
2. Click **New Project**
3. Choose **Local Repo** (point to a local git repo) or **From GitHub** (search and clone)
4. A git worktree and Docker container are created automatically

Each project gets:
- An isolated Docker container (Arch Linux with fish, tmux, Node, Bun, Claude Code)
- A shared terminal session via tmux (accessible across browser tabs)
- A reverse-proxy preview of any web server running inside the container

## Architecture

```
apps/
  api/     Hono + Bun API server (:3001) — Docker management, proxy, WebSocket terminals
  web/     React + Vite frontend (:5173) — dashboard, terminal, preview pane
  agent/   Tunnel agent — forwards ports from containers to the host
packages/
  shared/  Shared TypeScript types and utilities
docker/
  Dockerfile.devenv   Dev container image definition
```

## Development

```bash
bun dev          # Start everything (API + Web)
bun dev:api      # Start API only
bun dev:web      # Start Web only
```

The web dev server proxies `/api/*` and `/ws/*` requests to the API server automatically.

## How It Works

- **Worktrees**: Each project creates a git worktree from your source repo, so you can work on multiple branches simultaneously without affecting your main checkout.
- **Docker-in-Docker**: Containers run in privileged mode with their own Docker daemon, so projects can run `docker` commands independently.
- **Preview Proxy**: Web servers running inside containers are accessible at `/preview/{projectId}/` with automatic URL rewriting for assets, HMR, and fetch requests.
- **Tunnel Agent**: A lightweight agent runs alongside the API to forward TCP ports from containers to the host, with automatic discovery via `ss` polling.
- **Bind Mounts**: Your fish config, GitHub CLI config, Claude credentials, and tmux config are shared from the host into each container.
