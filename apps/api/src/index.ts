import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import { projectRoutes } from "./routes/projects";
import { containerRoutes } from "./routes/containers";
import { gitRoutes } from "./routes/git";
import { githubRoutes } from "./routes/github";
import { proxyRoute, nextCatchAllRoute } from "./routes/proxy";
import { agentRoutes } from "./routes/agent";
import { terminalWsHandler } from "./ws/terminal";
import { eventsWsHandler } from "./ws/events";
import { previewWsHandler } from "./ws/preview";
import { tunnelWsHandler } from "./ws/tunnel";
import { initDb } from "./db/schema";
import { initDockerClient } from "./docker/client";
import { startDockerEventListener, stopDockerEventListener } from "./docker/events";
import { stopAllPreviewProxies } from "./services/preview-proxy";
import { shutdownTunnels } from "./services/tunnel";

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
app.route("/api/agent", agentRoutes);

// WebSocket routes
app.get("/ws/terminal/:projectId/:sessionId", upgradeWebSocket(terminalWsHandler));
app.get("/ws/events", upgradeWebSocket(eventsWsHandler));
app.get("/ws/tunnel", upgradeWebSocket(tunnelWsHandler));

// WebSocket proxy for preview (HMR etc)
app.get("/preview/:projectId/*", upgradeWebSocket(previewWsHandler));

// Reverse proxy for web preview
app.all("/preview/:projectId/*", proxyRoute);
app.all("/preview/:projectId", proxyRoute);

// Catch-all for /_next requests that bypass the proxy prefix (HMR update chunks etc)
app.all("/_next/*", nextCatchAllRoute);

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
  shutdownTunnels();
  stopAllPreviewProxies();
  stopDockerEventListener();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  shutdownTunnels();
  stopAllPreviewProxies();
  stopDockerEventListener();
  server.stop();
  process.exit(0);
});

export default app;
