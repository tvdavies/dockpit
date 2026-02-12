import type { TunnelPortStatus } from "@dockpit/shared";

const AGENT_WS_URL = "ws://localhost:19222/ws";
const RECONNECT_INTERVAL = 5_000;

interface AgentState {
  connected: boolean;
  ports: TunnelPortStatus[];
}

let state: AgentState = { connected: false, ports: [] };
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function setState(next: AgentState) {
  state = next;
  notify();
}

function connectAgent() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

  const socket = new WebSocket(AGENT_WS_URL);
  ws = socket;

  socket.onopen = () => {
    setState({ ...state, connected: true });
  };

  socket.onmessage = (event) => {
    if (typeof event.data !== "string") return;
    try {
      const data = JSON.parse(event.data);
      setState({ ...state, ports: data.ports || [] });
    } catch {}
  };

  socket.onclose = () => {
    ws = null;
    setState({ connected: false, ports: [] });
    reconnectTimer = setTimeout(connectAgent, RECONNECT_INTERVAL);
  };

  socket.onerror = () => {};
}

// Auto-connect on module load
connectAgent();

export function getAgentSnapshot(): AgentState {
  return state;
}

export function subscribeAgent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function sendToAgent(data: string): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

export function killAgent(): void {
  fetch("http://localhost:19222/stop", { method: "POST" }).catch(() => {});
}
