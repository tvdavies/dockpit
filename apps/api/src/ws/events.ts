import type { WSContext } from "hono/ws";
import type { WsContainerEvent } from "@dockpit/shared";

const clients = new Set<WSContext>();

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
          }
        } catch {
          // Ignore
        }
      }
    },

    onClose(_event: Event, ws: WSContext) {
      clients.delete(ws);
    },

    onError(_event: Event, ws: WSContext) {
      clients.delete(ws);
    },
  };
}

export function broadcastEvent(event: WsContainerEvent): void {
  const data = JSON.stringify(event);
  for (const ws of clients) {
    try {
      ws.send(data);
    } catch {
      clients.delete(ws);
    }
  }
}
