import { Hono } from "hono";
import { getProject } from "../services/project";
import {
  createAndStartContainer,
  stopContainer,
  restartContainer,
  getContainerLogs,
  getTerminalPreview,
} from "../docker/containers";
import { destroyProjectSessions } from "../services/terminal";

export const containerRoutes = new Hono();

containerRoutes.post("/:id/start", async (c) => {
  const id = c.req.param("id");
  const project = getProject(id);
  if (!project) return c.json({ error: "Project not found" }, 404);

  if (project.containerStatus === "running") {
    return c.json({ error: "Container already running" }, 400);
  }

  try {
    const containerId = await createAndStartContainer(
      id,
      project.name,
      project.directory
    );
    const updated = getProject(id)!;
    return c.json({ data: updated });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to start container" }, 500);
  }
});

containerRoutes.post("/:id/stop", async (c) => {
  const id = c.req.param("id");
  const project = getProject(id);
  if (!project) return c.json({ error: "Project not found" }, 404);

  try {
    destroyProjectSessions(id);
    await stopContainer(id);
    const updated = getProject(id)!;
    return c.json({ data: updated });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to stop container" }, 500);
  }
});

containerRoutes.post("/:id/restart", async (c) => {
  const id = c.req.param("id");
  const project = getProject(id);
  if (!project) return c.json({ error: "Project not found" }, 404);

  try {
    destroyProjectSessions(id);
    await restartContainer(id);
    const updated = getProject(id)!;
    return c.json({ data: updated });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to restart container" }, 500);
  }
});

containerRoutes.get("/:id/logs", async (c) => {
  const id = c.req.param("id");
  const project = getProject(id);
  if (!project) return c.json({ error: "Project not found" }, 404);
  if (!project.containerId) {
    return c.json({ data: { lines: [] } });
  }

  const lines = Number(c.req.query("lines")) || 100;
  try {
    const logLines = await getContainerLogs(project.containerId, lines);
    return c.json({ data: { lines: logLines } });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to get logs" }, 500);
  }
});

containerRoutes.get("/:id/terminal-preview", async (c) => {
  const id = c.req.param("id");
  const project = getProject(id);
  if (!project) return c.json({ error: "Project not found" }, 404);
  if (!project.containerId) {
    return c.json({ data: { lines: [] } });
  }

  try {
    const lines = await getTerminalPreview(project.containerId);
    return c.json({ data: { lines } });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to get terminal preview" }, 500);
  }
});
