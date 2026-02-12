import { getContainerInfo } from "../docker/containers";
import { detectPort } from "../docker/port-detector";
import { getProject } from "./project";

interface PreviewProxy {
  server: ReturnType<typeof Bun.serve>;
  port: number;
  targetIp: string;
  targetPort: number;
}

const proxies = new Map<string, PreviewProxy>();

export async function getPreviewPort(projectId: string): Promise<number | null> {
  const project = getProject(projectId);
  if (!project?.containerId || project.containerStatus !== "running") return null;

  const info = await getContainerInfo(project.containerId);
  if (!info?.ip) return null;

  let port = project.previewPort;
  if (!port) {
    port = await detectPort(project.containerId);
    if (!port) return null;
  }

  // If proxy already running with same target, return it
  const existing = proxies.get(projectId);
  if (existing && existing.targetIp === info.ip && existing.targetPort === port) {
    return existing.port;
  }

  // Stop old proxy if target changed
  if (existing) {
    existing.server.stop();
    proxies.delete(projectId);
  }

  return startProxy(projectId, info.ip, port);
}

function startProxy(projectId: string, targetIp: string, targetPort: number): number {
  const wsConnections = new Map<unknown, WebSocket>();

  const server = Bun.serve({
    port: 0,
    hostname: "0.0.0.0",
    fetch(req, server) {
      const url = new URL(req.url);

      // Handle WebSocket upgrade
      if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const success = server.upgrade(req, {
          data: {
            targetUrl: `ws://${targetIp}:${targetPort}${url.pathname}${url.search}`,
          },
        });
        if (success) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Regular HTTP proxy
      const targetUrl = `http://${targetIp}:${targetPort}${url.pathname}${url.search}`;
      const headers = new Headers(req.headers);
      headers.delete("host");

      return fetch(targetUrl, {
        method: req.method,
        headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      }).then((resp) => {
        const respHeaders = new Headers(resp.headers);
        respHeaders.delete("transfer-encoding");
        // Allow iframe embedding
        respHeaders.delete("x-frame-options");
        respHeaders.delete("content-security-policy");
        return new Response(resp.body, {
          status: resp.status,
          headers: respHeaders,
        });
      }).catch((e) => new Response(`Proxy error: ${e.message}`, { status: 502 }));
    },
    websocket: {
      open(ws) {
        const { targetUrl } = ws.data as { targetUrl: string };
        const target = new WebSocket(targetUrl);

        target.addEventListener("open", () => {
          wsConnections.set(ws, target);
        });
        target.addEventListener("message", (event) => {
          try { ws.send(event.data as string | Buffer); } catch {}
        });
        target.addEventListener("close", () => {
          wsConnections.delete(ws);
          try { ws.close(); } catch {}
        });
        target.addEventListener("error", () => {
          wsConnections.delete(ws);
          try { ws.close(); } catch {}
        });

        // Store immediately so messages can queue
        wsConnections.set(ws, target);
      },
      message(ws, message) {
        const target = wsConnections.get(ws);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(message);
        }
      },
      close(ws) {
        const target = wsConnections.get(ws);
        if (target) {
          try { target.close(); } catch {}
          wsConnections.delete(ws);
        }
      },
    },
  });

  const proxy: PreviewProxy = { server, port: server.port, targetIp, targetPort };
  proxies.set(projectId, proxy);
  console.log(`Preview proxy for ${projectId} on port ${server.port} → ${targetIp}:${targetPort}`);
  return server.port;
}

export function stopPreviewProxy(projectId: string): void {
  const proxy = proxies.get(projectId);
  if (proxy) {
    proxy.server.stop();
    proxies.delete(projectId);
  }
}

export function stopAllPreviewProxies(): void {
  for (const [, proxy] of proxies) {
    proxy.server.stop();
  }
  proxies.clear();
}
