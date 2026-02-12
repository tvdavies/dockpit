export type WsMessage =
  | WsTerminalData
  | WsTerminalResize
  | WsContainerEvent
  | WsLogPreview
  | WsProjectFocus
  | WsAgentStatus
  | WsAgentStatusRequest
  | WsAgentKill
  | WsTunnelStatus
  | WsTunnelStatusRequest
  | WsTunnelDisconnect
  | WsPing
  | WsPong;

export interface WsTerminalData {
  type: "terminal:data";
  sessionId: string;
  data: string;
}

export interface WsTerminalResize {
  type: "terminal:resize";
  sessionId: string;
  cols: number;
  rows: number;
}

export interface WsContainerEvent {
  type: "container:event";
  projectId: string;
  status: string;
  containerId: string;
}

export interface WsLogPreview {
  type: "container:logs";
  projectId: string;
  lines: string[];
}

export interface WsPing {
  type: "ping";
}

export interface WsPong {
  type: "pong";
}

export interface WsProjectFocus {
  type: "project:focus";
  projectId: string | null;
}

export interface WsAgentStatus {
  type: "agent:status";
  connected: boolean;
}

export interface WsAgentStatusRequest {
  type: "agent:status:request";
}

export interface WsAgentKill {
  type: "agent:kill";
}

export interface TunnelPortStatus {
  port: number;
  localPort: number;
  status: "listening" | "error" | "pending";
}

export interface WsTunnelStatus {
  type: "tunnel:status";
  projectId: string;
  ports: TunnelPortStatus[];
}

export interface WsTunnelStatusRequest {
  type: "tunnel:status:request";
}

export interface WsTunnelDisconnect {
  type: "tunnel:disconnect";
  port: number;
}
