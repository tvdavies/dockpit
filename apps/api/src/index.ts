import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import { projectRoutes } from "./routes/projects";
import { containerRoutes } from "./routes/containers";
import { gitRoutes } from "./routes/git";
import { githubRoutes } from "./routes/github";
import { proxyRoute } from "./routes/proxy";
import { terminalWsHandler } from "./ws/terminal";
import { eventsWsHandler } from "./ws/events";
import { initDb } from "./db/schema";
import { initDockerClient } from "./docker/client";
import { startDockerEventListener, stopDockerEventListener } from "./docker/events";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173"],
  })
);

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// REST routes
app.route("/api/projects", projectRoutes);
app.route("/api/projects", containerRoutes);
app.route("/api/projects", gitRoutes);
app.route("/api/github", githubRoutes);

// WebSocket routes
app.get("/ws/terminal/:projectId/:sessionId", upgradeWebSocket(terminalWsHandler));
app.get("/ws/events", upgradeWebSocket(eventsWsHandler));

// Reverse proxy for web preview
app.all("/preview/:projectId/*", proxyRoute);
app.all("/preview/:projectId", proxyRoute);

// Init
initDb();
await initDockerClient();
startDockerEventListener();

const PORT = Number(process.env.PORT) || 3001;

const server = Bun.serve({
  port: PORT,
  fetch: app.fetch,
  websocket,
  idleTimeout: 120,
});

console.log(`Dockpit API running on http://localhost:${server.port}`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  stopDockerEventListener();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  stopDockerEventListener();
  server.stop();
  process.exit(0);
});

export default app;
