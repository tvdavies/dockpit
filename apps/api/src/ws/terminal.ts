import type { WSContext } from "hono/ws";
import { getProject } from "../services/project";
import {
  createTerminalSession,
  getTerminalSession,
  markDisconnected,
} from "../services/terminal";

export function terminalWsHandler(c: any) {
  const projectId = c.req.param("projectId");
  const sessionId = c.req.param("sessionId");
  let sessionReady: Promise<boolean> | null = null;

  return {
    onOpen(_event: Event, ws: WSContext) {
      const project = getProject(projectId);
      if (!project?.containerId || project.containerStatus !== "running") {
        ws.send(JSON.stringify({ type: "error", message: "Container not running" }));
        ws.close(1011, "Container not running");
        return;
      }

      sessionReady = (async () => {
        try {
          const session = await createTerminalSession(
            projectId,
            sessionId,
            project.containerId
          );

          // Pipe Docker exec stdout -> WebSocket (binary frames with 0x00 prefix)
          session.stream.on("data", (chunk: Buffer) => {
            try {
              const frame = new Uint8Array(chunk.length + 1);
              frame[0] = 0x00;
              frame.set(new Uint8Array(chunk), 1);
              ws.send(frame.buffer);
            } catch {
              // WS might be closed
            }
          });

          ws.send(JSON.stringify({ type: "terminal:ready", sessionId }));
          return true;
        } catch (e: any) {
          console.error(`[terminal] session creation failed:`, e);
          ws.send(
            JSON.stringify({ type: "error", message: e.message || "Failed to create session" })
          );
          ws.close(1011, "Session creation failed");
          return false;
        }
      })();
    },

    async onMessage(event: MessageEvent, ws: WSContext) {
      // Wait for session to be ready before processing messages
      if (sessionReady) await sessionReady;

      const session = getTerminalSession(sessionId);
      if (!session?.alive) return;

      if (event.data instanceof ArrayBuffer) {
        const data = Buffer.from(event.data);
        if (data.length > 0 && data[0] === 0x00) {
          session.stream.write(data.subarray(1));
        }
      } else if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "terminal:resize" && msg.cols && msg.rows) {
            session.exec.resize({ h: msg.rows, w: msg.cols });
          } else if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch {
          // Ignore parse errors
        }
      }
    },

    onClose() {
      markDisconnected(sessionId);
    },

    onError() {
      markDisconnected(sessionId);
    },
  };
}
