import { Hono } from "hono";
import { resolve } from "path";

export const agentRoutes = new Hono();

const AGENT_SOURCE = resolve(import.meta.dir, "../../../agent/src/index.ts");

agentRoutes.get("/source", async (c) => {
  try {
    const file = Bun.file(AGENT_SOURCE);
    const text = await file.text();
    return c.text(text);
  } catch {
    return c.text("Agent source not found", 404);
  }
});

agentRoutes.get("/install", (c) => {
  const host = c.req.header("x-forwarded-host") || c.req.header("host") || "localhost:3001";
  const proto = c.req.header("x-forwarded-proto") || "http";

  const wsHost = host.replace(/:\d+$/, ":3001");

  const script = `#!/bin/bash
set -euo pipefail

DEST_DIR="$HOME/.dockpit"
DEST="$DEST_DIR/agent.ts"
PID_FILE="$DEST_DIR/agent.pid"
LOG_FILE="$DEST_DIR/agent.log"
WS_URL="ws://${wsHost}"

mkdir -p "$DEST_DIR"

# Stop existing agent if running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 0.5
  fi
  rm -f "$PID_FILE"
fi

# Download agent source
curl -fsSL "${proto}://${host}/api/agent/source" -o "$DEST"

# Ensure bun is available
if ! command -v bun &>/dev/null; then
  echo "Installing bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:\$PATH"
fi

# Start agent in background
nohup bun "$DEST" "$WS_URL" > "$LOG_FILE" 2>&1 &

echo $! > "$PID_FILE"
echo "Dockpit agent started (pid $!, log: $LOG_FILE)"
`;

  return c.text(script, 200, { "Content-Type": "text/plain" });
});
