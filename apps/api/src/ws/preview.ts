import type { WSContext } from "hono/ws";
import { getProject } from "../services/project";
import { getContainerInfo } from "../docker/containers";
import { detectPort } from "../docker/port-detector";

export function previewWsHandler(c: any) {
  const projectId = c.req.param("projectId");
  const targetConnections = new Map<WSContext, WebSocket>();

  return {
    async onOpen(_event: Event, ws: WSContext) {
      const project = getProject(projectId);
      if (!project?.containerId || project.containerStatus !== "running") {
        ws.close(1011, "Container not running");
        return;
      }

      const info = await getContainerInfo(project.containerId);
      if (!info?.ip) {
        ws.close(1011, "Cannot resolve container");
        return;
      }

      let port = project.previewPort;
      if (!port) {
        port = await detectPort(project.containerId);
        if (!port) {
          ws.close(1011, "No port detected");
          return;
        }
      }

      // Build target WebSocket URL from the original request path
      const basePath = `/preview/${projectId}`;
      const reqUrl = new URL(c.req.url);
      const reqPath = reqUrl.pathname.replace(basePath, "") || "/";
      const targetUrl = `ws://${info.ip}:${port}${reqPath}${reqUrl.search}`;

      console.log(`[preview-ws] Connecting: ${targetUrl}`);

      const target = new WebSocket(targetUrl);

      target.addEventListener("open", () => {
        console.log(`[preview-ws] Connected to ${targetUrl}`);
        targetConnections.set(ws, target);
      });

      target.addEventListener("message", (event) => {
        try {
          ws.send(event.data as string | Buffer);
        } catch {}
      });

      target.addEventListener("close", () => {
        targetConnections.delete(ws);
        try { ws.close(); } catch {}
      });

      target.addEventListener("error", (e) => {
        console.error(`[preview-ws] Error connecting to ${targetUrl}:`, e);
        targetConnections.delete(ws);
        try { ws.close(); } catch {}
      });

      targetConnections.set(ws, target);
    },

    onMessage(event: MessageEvent, ws: WSContext) {
      const target = targetConnections.get(ws);
      if (target && target.readyState === WebSocket.OPEN) {
        target.send(event.data as string | Buffer);
      }
    },

    onClose(_event: CloseEvent, ws: WSContext) {
      const target = targetConnections.get(ws);
      if (target) {
        try { target.close(); } catch {}
        targetConnections.delete(ws);
      }
    },
  };
}
