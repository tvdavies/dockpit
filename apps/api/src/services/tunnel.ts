import { Socket } from "net";
import { resolve } from "path";
import type { WSContext } from "hono/ws";
import type { TunnelPortStatus } from "@dockpit/shared";
import { getContainerInfo } from "../docker/containers";
import { startWatching, stopWatching } from "../docker/port-watcher";
import { getProject, getDetectedPorts, setDetectedPorts } from "./project";

// Agent control message types (sent/received as JSON on the tunnel WS)
interface TunnelPortsMsg {
  type: "tunnel:ports";
  ports: number[];
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

interface TunnelTcpConnectedMsg {
  type: "tunnel:tcp:connected";
  connectionId: number;
}

interface TunnelTcpCloseMsg {
  type: "tunnel:tcp:close";
  connectionId: number;
}

type AgentMessage = TunnelListeningMsg | TunnelErrorMsg | TunnelTcpOpenMsg | TunnelTcpCloseMsg;

interface ProjectTunnelConfig {
  ports?: number[];
}

// State
let agentWs: WSContext | null = null;
let focusedProjectId: string | null = null;
let activePorts: number[] = [];
let projectConfig: ProjectTunnelConfig | null = null;
const portStatuses = new Map<number, TunnelPortStatus>();
const tcpConnections = new Map<number, Socket>();

export function setAgentConnection(ws: WSContext): void {
  agentWs = ws;

  // If we already have a focused project, sync ports immediately
  if (focusedProjectId) {
    sendPortsToAgent(activePorts);
  }
}

export function clearAgentConnection(): void {
  agentWs = null;
  for (const [id, socket] of tcpConnections) {
    socket.destroy();
    tcpConnections.delete(id);
  }
  portStatuses.clear();
}

export function setFocusedProject(projectId: string | null): void {
  // Skip teardown/rebuild if re-focusing the same project
  if (projectId && projectId === focusedProjectId) return;

  // Stop watching old project
  stopWatching();
  activePorts = [];
  portStatuses.clear();
  projectConfig = null;

  // Clean up TCP connections from previous project
  for (const [id, socket] of tcpConnections) {
    socket.destroy();
    tcpConnections.delete(id);
  }

  focusedProjectId = projectId;

  if (!projectId) {
    sendPortsToAgent([]);
    return;
  }

  // Load project config and start watching
  loadProjectConfig(projectId);

  // Send cached ports to the agent immediately (don't wait for port watcher)
  const cachedPorts = filterPorts(getDetectedPorts(projectId));
  if (cachedPorts.length > 0) {
    activePorts = cachedPorts;
    sendPortsToAgent(cachedPorts);
  }

  // Port watcher runs in the background to discover new ports / remove stale ones
  startProjectPortWatching(projectId, cachedPorts);
}

export function getFocusedProjectId(): string | null {
  return focusedProjectId;
}

function loadProjectConfig(projectId: string): void {
  const project = getProject(projectId);
  if (!project?.directory) return;

  const configPath = resolve(project.directory, ".dockpit", "config.yaml");
  try {
    const text = require("fs").readFileSync(configPath, "utf-8");
    const config = parseSimpleYaml(text);
    if (config.tunnel) {
      projectConfig = {
        ports: config.tunnel.ports as number[] | undefined,
      };
      console.log(`[tunnel] Loaded config for ${project.name}: ports=${projectConfig.ports?.join(",") || "all"}`);
    }
  } catch {
    // No config file — tunnel all detected ports
    projectConfig = null;
  }
}

// Minimal YAML parser for our simple config format
function parseSimpleYaml(text: string): Record<string, any> {
  const result: Record<string, any> = {};
  let currentSection: string | null = null;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Top-level key (no indent)
    const sectionMatch = trimmed.match(/^(\w+):$/);
    if (sectionMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
      currentSection = sectionMatch[1];
      result[currentSection] = {};
      continue;
    }

    if (currentSection) {
      // Array item: "  - value"
      const arrayItemMatch = trimmed.match(/^-\s+(.+)$/);
      // Key with array: "  ports: [3000, 5173]"
      const inlineArrayMatch = trimmed.match(/^(\w+):\s*\[([^\]]*)\]$/);
      // Key with value: "  key: value"
      const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);

      if (inlineArrayMatch) {
        const key = inlineArrayMatch[1];
        const values = inlineArrayMatch[2].split(",").map((v) => {
          const n = Number(v.trim());
          return isNaN(n) ? v.trim() : n;
        });
        result[currentSection][key] = values;
      } else if (kvMatch && !result[currentSection][kvMatch[1]]) {
        const key = kvMatch[1];
        const val = kvMatch[2].trim();
        const n = Number(val);
        result[currentSection][key] = isNaN(n) ? val : n;
      } else if (arrayItemMatch) {
        // Find the last key that was set and append to it as array
        const keys = Object.keys(result[currentSection]);
        const lastKey = keys[keys.length - 1];
        if (lastKey) {
          if (!Array.isArray(result[currentSection][lastKey])) {
            result[currentSection][lastKey] = [];
          }
          const val = arrayItemMatch[1].trim();
          const n = Number(val);
          result[currentSection][lastKey].push(isNaN(n) ? val : n);
        }
      }
    }
  }
  return result;
}

function filterPorts(ports: number[]): number[] {
  if (!projectConfig?.ports || projectConfig.ports.length === 0) {
    return ports;
  }
  const allowed = new Set(projectConfig.ports);
  return ports.filter((p) => allowed.has(p));
}

async function startProjectPortWatching(projectId: string, cachedPorts: number[] = []): Promise<void> {
  const project = getProject(projectId);
  if (!project?.containerId || project.containerStatus !== "running") return;

  startWatching(project.containerId, (ports) => {
    if (focusedProjectId !== projectId) return;
    const filtered = filterPorts(ports);
    activePorts = filtered;
    portStatuses.clear();
    for (const port of filtered) {
      portStatuses.set(port, { port, localPort: port, status: "pending" });
    }
    setDetectedPorts(projectId, filtered);
    sendPortsToAgent(filtered);
  }, cachedPorts);
}

function sendPortsToAgent(ports: number[]): void {
  if (!agentWs) return;
  const msg: TunnelPortsMsg = { type: "tunnel:ports", ports };
  try {
    agentWs.send(JSON.stringify(msg));
  } catch {
    // Agent disconnected
  }
}

export function handleAgentMessage(data: string): void {
  let msg: AgentMessage;
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }

  switch (msg.type) {
    case "tunnel:listening":
      handleTunnelListening(msg);
      break;
    case "tunnel:error":
      handleTunnelError(msg);
      break;
    case "tunnel:tcp:open":
      handleAgentTcpOpen(msg.connectionId, msg.port);
      break;
    case "tunnel:tcp:close":
      handleAgentTcpClose(msg.connectionId);
      break;
  }
}

function handleTunnelListening(msg: TunnelListeningMsg): void {
  portStatuses.set(msg.port, {
    port: msg.port,
    localPort: msg.localPort,
    status: "listening",
  });
  }

function handleTunnelError(msg: TunnelErrorMsg): void {
  portStatuses.set(msg.port, {
    port: msg.port,
    localPort: msg.port,
    status: "error",
  });
  }

async function handleAgentTcpOpen(connectionId: number, port: number): Promise<void> {
  if (!focusedProjectId) return;

  const project = getProject(focusedProjectId);
  if (!project?.containerId) return;

  const info = await getContainerInfo(project.containerId);
  if (!info?.ip) {
    sendTcpClose(connectionId);
    return;
  }

  const socket = new Socket();

  socket.on("data", (data: Buffer) => {
    sendTcpData(connectionId, data);
  });

  socket.on("close", () => {
    tcpConnections.delete(connectionId);
    sendTcpClose(connectionId);
  });

  socket.on("error", () => {
    tcpConnections.delete(connectionId);
    sendTcpClose(connectionId);
  });

  socket.connect(port, info.ip, () => {
    tcpConnections.set(connectionId, socket);
    if (agentWs) {
      const msg: TunnelTcpConnectedMsg = { type: "tunnel:tcp:connected", connectionId };
      try {
        agentWs.send(JSON.stringify(msg));
      } catch { /* disconnected */ }
    }
  });
}

export function handleAgentTcpData(connectionId: number, data: Buffer): void {
  const socket = tcpConnections.get(connectionId);
  if (socket && !socket.destroyed) {
    socket.write(data);
  }
}

function handleAgentTcpClose(connectionId: number): void {
  const socket = tcpConnections.get(connectionId);
  if (socket) {
    socket.destroy();
    tcpConnections.delete(connectionId);
  }
}

function sendTcpData(connectionId: number, data: Buffer): void {
  if (!agentWs) return;
  const frame = Buffer.alloc(4 + data.length);
  frame.writeUInt32BE(connectionId, 0);
  data.copy(frame, 4);
  try {
    agentWs.send(frame);
  } catch { /* disconnected */ }
}

function sendTcpClose(connectionId: number): void {
  if (!agentWs) return;
  const msg: TunnelTcpCloseMsg = { type: "tunnel:tcp:close", connectionId };
  try {
    agentWs.send(JSON.stringify(msg));
  } catch { /* disconnected */ }
}


export function disconnectPort(port: number): boolean {
  if (!portStatuses.has(port)) return false;

  // Remove from active ports and statuses
  activePorts = activePorts.filter((p) => p !== port);
  portStatuses.delete(port);

  // Tell the agent to stop tunnelling this port (resends the full updated list)
  sendPortsToAgent(activePorts);
    return true;
}

export function onContainerStopped(projectId: string): void {
  if (focusedProjectId !== projectId) return;
  stopWatching();
  activePorts = [];
  portStatuses.clear();
  sendPortsToAgent([]);
  }

export function onContainerStarted(projectId: string): void {
  if (focusedProjectId !== projectId) return;
  const cachedPorts = filterPorts(getDetectedPorts(projectId));
  startProjectPortWatching(projectId, cachedPorts);
}

export function shutdownTunnels(): void {
  stopWatching();
  for (const [, socket] of tcpConnections) {
    socket.destroy();
  }
  tcpConnections.clear();
  portStatuses.clear();
}
