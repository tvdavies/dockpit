import type { WSContext } from "hono/ws";
import type { WsContainerEvent } from "@dockpit/shared";
import { setFocusedProject, disconnectPort } from "../services/tunnel";

type BroadcastableEvent = WsContainerEvent;

const clients = new Set<WSContext>();
let focusOwner: WSContext | null = null;

export function eventsWsHandler(_c: any) {
  return {
    onOpen(_event: Event, ws: WSContext) {
      clients.add(ws);
    },

    onMessage(event: MessageEvent, ws: WSContext) {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          } else if (msg.type === "project:focus") {
            const projectId = msg.projectId || null;
            if (projectId) {
              focusOwner = ws;
              setFocusedProject(projectId);
            } else if (!focusOwner || focusOwner === ws || !clients.has(focusOwner)) {
              // Accept unfocus from current owner, or from any client if
              // the previous owner has disconnected (navigated away).
              focusOwner = null;
              setFocusedProject(null);
            }
          } else if (msg.type === "tunnel:disconnect" && typeof msg.port === "number") {
            disconnectPort(msg.port);
          }
        } catch {
          // Ignore
        }
      }
    },

    onClose(_event: Event, ws: WSContext) {
      clients.delete(ws);
      if (focusOwner === ws) {
        focusOwner = null;
        setFocusedProject(null);
      }
    },

    onError(_event: Event, ws: WSContext) {
      clients.delete(ws);
      if (focusOwner === ws) {
        focusOwner = null;
        setFocusedProject(null);
      }
    },
  };
}

export function broadcastEvent(event: BroadcastableEvent): void {
  const data = JSON.stringify(event);
  for (const ws of clients) {
    try {
      ws.send(data);
    } catch {
      clients.delete(ws);
    }
  }
}
