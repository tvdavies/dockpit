#!/usr/bin/env bun
/**
 * Dockpit Tunnel Agent
 *
 * Creates direct TCP tunnels from localhost ports to container ports
 * via a WebSocket connection to the Dockpit API server.
 *
 * Usage: bun agent.ts ws://localhost:3001
 *        node --experimental-websocket agent.ts ws://localhost:3001
 */

import { createServer, Socket } from "net";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Server } from "net";
import type { ServerWebSocket } from "bun";

const CONTROL_PORT = 19222;
const CACHE_PATH = join(homedir(), ".dockpit", "tunnel-cache.json");

// --- Protocol types (duplicated to keep agent self-contained) ---

interface TunnelPortsMsg {
  type: "tunnel:ports";
  ports: number[];
}

interface TunnelTcpConnectedMsg {
  type: "tunnel:tcp:connected";
  connectionId: number;
}

interface TunnelTcpCloseMsg {
  type: "tunnel:tcp:close";
  connectionId: number;
}

interface TunnelListeningMsg {
  type: "tunnel:listening";
  port: number;
  localPort: number;
}

interface TunnelErrorMsg {
  type: "tunnel:error";
  port: number;
  error: string;
}

interface TunnelTcpOpenMsg {
  type: "tunnel:tcp:open";
  connectionId: number;
  port: number;
}

// --- State ---

const serverUrl = process.argv[2];
if (!serverUrl) {
  console.error("Usage: bun agent.ts ws://localhost:3001");
  process.exit(1);
}

const wsUrl = `${serverUrl.replace(/\/$/, "")}/ws/tunnel`;

const HEARTBEAT_TIMEOUT = 60_000;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let nextConnectionId = 1;
let shuttingDown = false;

// port -> local TCP server
const tunnels = new Map<number, Server>();
// port -> set of connectionIds through that tunnel
const tunnelConnections = new Map<number, Set<number>>();
// connectionId -> local TCP socket
const connections = new Map<number, Socket>();
// connectionId -> buffer of data received before container TCP is ready
const pendingData = new Map<number, Buffer[]>();
// connectionId -> whether container has confirmed connection
const connectionReady = new Map<number, boolean>();
// connectionId -> container port (for cleanup)
const connectionPort = new Map<number, number>();

// Browser WebSocket clients for status updates
const browserClients = new Set<ServerWebSocket>();

// Per-project port cache for optimistic tunnel creation
let cache: Record<string, number[]> = {};
let currentProjectId: string | null = null;

function loadCache(): void {
  try {
    cache = JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
  } catch {
    cache = {};
  }
}

function saveCache(): void {
  try {
    mkdirSync(join(homedir(), ".dockpit"), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache));
  } catch {}
}

// --- Browser status broadcasting ---

function getTunnelState(): { ports: Array<{ port: number; localPort: number; status: string }> } {
  const ports = [];
  for (const [port, server] of tunnels) {
    const addr = server.address();
    if (addr && typeof addr === "object") {
      ports.push({ port, localPort: addr.port, status: "listening" });
    }
  }
  return { ports };
}

function broadcastState(): void {
  const data = JSON.stringify(getTunnelState());
  for (const client of browserClients) {
    try {
      client.send(data);
    } catch {
      browserClients.delete(client);
    }
  }
}

// --- WebSocket ---

function connect(): void {
  if (shuttingDown) return;

  console.log(`Connecting to ${wsUrl}...`);
  const socket = new WebSocket(wsUrl);
  socket.binaryType = "arraybuffer";

  socket.onopen = () => {
    console.log("Connected to Dockpit server");
    ws = socket;
    resetHeartbeat();

    // Start keepalive
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30_000);
  };

  socket.onmessage = (event: MessageEvent) => {
    resetHeartbeat();

    if (typeof event.data === "string") {
      handleControlMessage(event.data);
    } else if (event.data instanceof ArrayBuffer) {
      handleBinaryFrame(event.data);
    }
  };

  socket.onclose = () => {
    console.log("Disconnected from server");
    ws = null;
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    clearHeartbeat();
    closeAllTunnels();
    scheduleReconnect();
  };

  socket.onerror = () => {
    // onclose will fire after this
  };
}

function resetHeartbeat(): void {
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(() => {
    console.log("No messages from server for 60s, closing tunnels");
    closeAllTunnels();
  }, HEARTBEAT_TIMEOUT);
}

function clearHeartbeat(): void {
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleReconnect(): void {
  if (shuttingDown) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3_000);
}

function sendJson(msg: TunnelListeningMsg | TunnelErrorMsg | TunnelTcpOpenMsg | TunnelTcpCloseMsg): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendBinary(connectionId: number, data: Buffer): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  const frame = Buffer.alloc(4 + data.length);
  frame.writeUInt32BE(connectionId, 0);
  data.copy(frame, 4);
  ws.send(frame);
}

// --- Control messages from server ---

function handleControlMessage(raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  switch (msg.type) {
    case "tunnel:ports": {
      const serverPorts = (msg as TunnelPortsMsg).ports;
      syncTunnels(serverPorts);
      // Update cache with server-confirmed ports
      if (currentProjectId) {
        if (serverPorts.length > 0) {
          cache[currentProjectId] = serverPorts;
        } else {
          delete cache[currentProjectId];
        }
        saveCache();
      }
      break;
    }
    case "tunnel:tcp:connected":
      handleTcpConnected((msg as TunnelTcpConnectedMsg).connectionId);
      break;
    case "tunnel:tcp:close":
      handleTcpClose((msg as TunnelTcpCloseMsg).connectionId);
      break;
    case "agent:shutdown":
      console.log("Received shutdown command");
      shutdown();
      break;
  }
}

function handleBinaryFrame(data: ArrayBuffer): void {
  const buf = Buffer.from(data);
  if (buf.length < 4) return;
  const connectionId = buf.readUInt32BE(0);
  const payload = buf.subarray(4);

  const socket = connections.get(connectionId);
  if (socket && !socket.destroyed) {
    socket.write(payload);
  }
}

// --- Project focus (from browser) ---

function handleProjectFocus(projectId: string | null): void {
  const changed = projectId !== currentProjectId;
  currentProjectId = projectId;

  if (!projectId) return;

  // Optimistically open tunnels from cache (on focus or re-focus)
  const cachedPorts = cache[projectId];
  if (cachedPorts && cachedPorts.length > 0) {
    // Only log on actual project change
    if (changed) {
      console.log(`Optimistic tunnels for project: ${cachedPorts.join(", ")}`);
    }
    syncTunnels(cachedPorts);
  }
}

// --- Tunnel management ---

function syncTunnels(ports: number[]): void {
  const desired = new Set(ports);

  // Close tunnels for ports no longer needed
  for (const [port] of tunnels) {
    if (!desired.has(port)) {
      closeTunnel(port);
    }
  }

  // Open tunnels for new ports, re-report existing ones
  for (const port of ports) {
    if (!tunnels.has(port)) {
      openTunnel(port);
    } else {
      // Re-report existing tunnel so the server has the current localPort mapping
      const server = tunnels.get(port)!;
      const addr = server.address();
      if (addr && typeof addr === "object") {
        sendJson({ type: "tunnel:listening", port, localPort: addr.port });
      }
    }
  }

  if (ports.length > 0) {
    console.log(`Syncing tunnels: ${ports.join(", ")}`);
  }

  // Broadcast after sync (covers closes and re-reports; new opens broadcast in listen callback)
  broadcastState();
}

function openTunnel(port: number): void {
  startListener(port, port);
}

function startListener(port: number, localPort: number): void {
  const server = createServer((socket) => {
    const connectionId = nextConnectionId++;

    connections.set(connectionId, socket);
    connectionReady.set(connectionId, false);
    connectionPort.set(connectionId, port);
    pendingData.set(connectionId, []);

    // Track connection under its tunnel
    if (!tunnelConnections.has(port)) tunnelConnections.set(port, new Set());
    tunnelConnections.get(port)!.add(connectionId);

    sendJson({ type: "tunnel:tcp:open", connectionId, port });

    socket.on("data", (data: Buffer) => {
      if (connectionReady.get(connectionId)) {
        sendBinary(connectionId, data);
      } else {
        pendingData.get(connectionId)?.push(Buffer.from(data));
      }
    });

    socket.on("close", () => {
      cleanupConnection(connectionId);
      sendJson({ type: "tunnel:tcp:close", connectionId });
    });

    socket.on("error", () => {
      cleanupConnection(connectionId);
      sendJson({ type: "tunnel:tcp:close", connectionId });
    });
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && localPort === port) {
      console.log(`Port ${port} in use, trying alternative...`);
      startListener(port, 0);
      return;
    }
    console.error(`Failed to listen for container port ${port}: ${err.message}`);
    sendJson({ type: "tunnel:error", port, error: err.message });
    tunnels.delete(port);
    broadcastState();
  });

  server.listen(localPort, "127.0.0.1", () => {
    const addr = server.address();
    const actualPort = typeof addr === "object" && addr ? addr.port : localPort;
    console.log(`Tunnel open: localhost:${actualPort} -> container:${port}`);
    sendJson({ type: "tunnel:listening", port, localPort: actualPort });
    broadcastState();
  });

  tunnels.set(port, server);
}

function cleanupConnection(connectionId: number): void {
  connections.delete(connectionId);
  connectionReady.delete(connectionId);
  pendingData.delete(connectionId);
  const port = connectionPort.get(connectionId);
  if (port !== undefined) {
    tunnelConnections.get(port)?.delete(connectionId);
    connectionPort.delete(connectionId);
  }
}

function closeTunnel(port: number): void {
  const server = tunnels.get(port);
  if (!server) return;

  // Close only connections belonging to this tunnel
  const connIds = tunnelConnections.get(port);
  if (connIds) {
    for (const id of connIds) {
      const socket = connections.get(id);
      if (socket) socket.destroy();
      connections.delete(id);
      connectionReady.delete(id);
      pendingData.delete(id);
      connectionPort.delete(id);
    }
    tunnelConnections.delete(port);
  }

  server.close();
  tunnels.delete(port);
  console.log(`Tunnel closed: port ${port}`);
}

function closeAllTunnels(): void {
  for (const [port] of tunnels) {
    closeTunnel(port);
  }
  broadcastState();
}

function handleTcpConnected(connectionId: number): void {
  connectionReady.set(connectionId, true);

  const buffered = pendingData.get(connectionId);
  if (buffered && buffered.length > 0) {
    for (const chunk of buffered) {
      sendBinary(connectionId, chunk);
    }
  }
  pendingData.delete(connectionId);
}

function handleTcpClose(connectionId: number): void {
  const socket = connections.get(connectionId);
  if (socket) {
    socket.destroy();
    cleanupConnection(connectionId);
  }
}

// --- Lifecycle ---

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nShutting down...");

  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pingTimer) clearInterval(pingTimer);
  clearHeartbeat();
  closeAllTunnels();

  // Close browser WS clients
  for (const client of browserClients) {
    try { client.close(); } catch {}
  }
  browserClients.clear();

  controlServer.stop();

  if (ws) {
    ws.close();
    ws = null;
  }

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// --- Control server (HTTP + WebSocket for browser) ---

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST",
  "Access-Control-Allow-Headers": "Content-Type",
};

const controlServer = Bun.serve({
  port: CONTROL_PORT,
  hostname: "127.0.0.1",

  fetch(req, server) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // WebSocket upgrade for browser status
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("Upgrade failed", { status: 400 });
    }

    // Stop endpoint
    if (req.method === "POST" && url.pathname === "/stop") {
      setTimeout(() => shutdown(), 100);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      browserClients.add(ws);
      // Send current state immediately on connect
      ws.send(JSON.stringify(getTunnelState()));
    },
    close(ws) {
      browserClients.delete(ws);
    },
    message(_ws, message) {
      if (typeof message !== "string") return;
      try {
        const msg = JSON.parse(message);
        if (msg.type === "project:focus") {
          handleProjectFocus(msg.projectId || null);
        }
      } catch {}
    },
  },
});

console.log(`Control server on http://127.0.0.1:${CONTROL_PORT}`);

// --- Start ---
loadCache();
connect();
