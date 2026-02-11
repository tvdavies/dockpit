import { Hono } from "hono";
import { getGhAuthStatus, listGhRepos } from "../services/github";

export const githubRoutes = new Hono();

githubRoutes.get("/auth", async (c) => {
  const status = await getGhAuthStatus();
  return c.json({ data: status });
});

githubRoutes.get("/repos", async (c) => {
  const q = c.req.query("q") || undefined;
  const limit = Number(c.req.query("limit")) || 30;
  try {
    const result = await listGhRepos({ query: q, limit });
    return c.json({ data: result });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
