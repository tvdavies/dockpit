export type WsMessage =
  | WsTerminalData
  | WsTerminalResize
  | WsContainerEvent
  | WsLogPreview
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
