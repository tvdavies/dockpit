import type { Context } from "hono";
import { getProject } from "../services/project";
import { getContainerInfo } from "../docker/containers";
import { detectPort } from "../docker/port-detector";

export async function proxyRoute(c: Context): Promise<Response> {
  const projectId = c.req.param("projectId");
  const project = getProject(projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!project.containerId || project.containerStatus !== "running") {
    return c.text("Container not running", 503);
  }

  const info = await getContainerInfo(project.containerId);
  if (!info?.ip) {
    return c.text("Cannot resolve container IP", 503);
  }

  // Determine port
  let port = project.previewPort;
  if (!port) {
    port = await detectPort(project.containerId);
    if (!port) {
      return c.text("No port detected. Start a dev server or set port manually.", 503);
    }
  }

  // Build the target URL
  const path = c.req.path.replace(`/preview/${projectId}`, "") || "/";
  const query = c.req.url.includes("?")
    ? "?" + c.req.url.split("?")[1]
    : "";
  const targetUrl = `http://${info.ip}:${port}${path}${query}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");

    const resp = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body:
        c.req.method !== "GET" && c.req.method !== "HEAD"
          ? c.req.raw.body
          : undefined,
    });

    // Forward response with modified headers
    const respHeaders = new Headers(resp.headers);
    respHeaders.delete("transfer-encoding");

    return new Response(resp.body, {
      status: resp.status,
      headers: respHeaders,
    });
  } catch (e: any) {
    return c.text(`Proxy error: ${e.message}`, 502);
  }
}
