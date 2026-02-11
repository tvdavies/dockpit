import { Hono } from "hono";
import { getProject } from "../services/project";
import { getGitStatus, getGitDiff, getGitLog } from "../services/git";

export const gitRoutes = new Hono();

gitRoutes.get("/:id/git/status", async (c) => {
  const project = getProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  try {
    const status = await getGitStatus(project.directory);
    return c.json({ data: status });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to get git status" }, 500);
  }
});

gitRoutes.get("/:id/git/diff", async (c) => {
  const project = getProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  try {
    const diff = await getGitDiff(project.directory);
    return c.json({ data: diff });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to get git diff" }, 500);
  }
});

gitRoutes.get("/:id/git/log", async (c) => {
  const project = getProject(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const limit = Number(c.req.query("limit")) || 20;
  try {
    const entries = await getGitLog(project.directory, limit);
    return c.json({ data: { entries } });
  } catch (e: any) {
    return c.json({ error: e.message || "Failed to get git log" }, 500);
  }
});
