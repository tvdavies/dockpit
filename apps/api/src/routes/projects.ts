import { Hono } from "hono";
import {
  listProjects,
  getProject,
  createProject,
  createProjectFromGitHub,
  updateProject,
  deleteProject,
  ValidationError,
  NotFoundError,
} from "../services/project";
import { stopContainer, destroyProjectSessions } from "./helpers";

export const projectRoutes = new Hono();

projectRoutes.get("/", (c) => {
  const projects = listProjects();
  return c.json({ data: projects });
});

projectRoutes.get("/:id", (c) => {
  const project = getProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json({ data: project });
});

projectRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const project = body.repo
      ? await createProjectFromGitHub(body)
      : await createProject(body);
    return c.json({ data: project }, 201);
  } catch (e) {
    if (e instanceof ValidationError) {
      return c.json({ error: e.message }, 400);
    }
    const message = e instanceof Error ? e.message : "Failed to create project";
    console.error("Project creation error:", e);
    return c.json({ error: message }, 500);
  }
});

projectRoutes.patch("/:id", async (c) => {
  try {
    const body = await c.req.json();
    const project = updateProject(c.req.param("id"), body);
    return c.json({ data: project });
  } catch (e) {
    if (e instanceof NotFoundError) {
      return c.json({ error: e.message }, 404);
    }
    if (e instanceof ValidationError) {
      return c.json({ error: e.message }, 400);
    }
    throw e;
  }
});

projectRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const keepWorktree = c.req.query("keepWorktree") === "true";
  try {
    // Stop container if running
    const project = getProject(id);
    if (project?.containerId) {
      const { stopContainer: stop } = await import("../docker/containers");
      await stop(id);
    }
    await deleteProject(id, keepWorktree);
    return c.json({ data: { ok: true } });
  } catch (e) {
    if (e instanceof NotFoundError) {
      return c.json({ error: e.message }, 404);
    }
    throw e;
  }
});
