import type { WSContext } from "hono/ws";
import {
  setAgentConnection,
  clearAgentConnection,
  handleAgentMessage,
  handleAgentTcpData,
} from "../services/tunnel";

export function tunnelWsHandler(_c: any) {
  return {
    onOpen(_event: Event, ws: WSContext) {
      console.log("[tunnel-ws] Agent connected");
      setAgentConnection(ws);
    },

    onMessage(event: MessageEvent, _ws: WSContext) {
      if (typeof event.data === "string") {
        // JSON control message
        handleAgentMessage(event.data);
      } else {
        // Binary data frame: [4 bytes connectionId uint32 BE][payload]
        let buf: Buffer;
        if (event.data instanceof ArrayBuffer) {
          buf = Buffer.from(event.data);
        } else if (Buffer.isBuffer(event.data)) {
          buf = event.data;
        } else {
          return;
        }

        if (buf.length < 4) return;
        const connectionId = buf.readUInt32BE(0);
        const payload = buf.subarray(4);
        handleAgentTcpData(connectionId, payload);
      }
    },

    onClose(_event: Event, _ws: WSContext) {
      console.log("[tunnel-ws] Agent disconnected");
      clearAgentConnection();
    },

    onError(_event: Event, _ws: WSContext) {
      console.log("[tunnel-ws] Agent connection error");
      clearAgentConnection();
    },
  };
}
