import { connect, type Socket } from "net";
import { getDocker } from "../docker/client";
import { getDb } from "../db/schema";
import type Docker from "dockerode";

interface TerminalSession {
  projectId: string;
  sessionId: string;
  exec: Docker.Exec;
  stream: Socket;
  containerId: string;
  alive: boolean;
  disconnectedAt: number | null;
}

const sessions = new Map<string, TerminalSession>();

// Reconnection window: 60 seconds
const RECONNECT_WINDOW_MS = 60_000;

/**
 * Start a Docker exec via raw socket to /var/run/docker.sock.
 * dockerode's exec.start() with stdin hangs under Bun because it uses
 * HTTP hijack which Bun's http module doesn't support. We bypass it by
 * speaking the Docker API protocol directly over a Unix socket.
 */
function startExecRaw(execId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: "/var/run/docker.sock" });
    let headerBuf = "";
    let headersParsed = false;

    const onError = (err: Error) => {
      reject(new Error(`Docker socket error: ${err.message}`));
    };

    socket.on("error", onError);

    socket.on("connect", () => {
      const body = JSON.stringify({ Detach: false, Tty: true });
      const req = [
        `POST /exec/${execId}/start HTTP/1.1`,
        `Host: localhost`,
        `Content-Type: application/json`,
        `Connection: Upgrade`,
        `Upgrade: tcp`,
        `Content-Length: ${body.length}`,
        ``,
        body,
      ].join("\r\n");
      socket.write(req);
    });

    // Parse and strip the HTTP response headers before resolving
    const onData = (data: Buffer) => {
      if (headersParsed) return; // Already resolved, let normal listeners handle

      headerBuf += data.toString("binary");
      const headerEnd = headerBuf.indexOf("\r\n\r\n");
      if (headerEnd === -1) return; // Need more data for headers

      const headers = headerBuf.slice(0, headerEnd);
      if (!headers.startsWith("HTTP/1.1 101")) {
        socket.destroy();
        reject(new Error(`Docker exec start failed: ${headers.split("\r\n")[0]}`));
        return;
      }

      headersParsed = true;
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);

      // Re-emit any data that came after the headers
      const headerBytes = Buffer.byteLength(headers + "\r\n\r\n", "binary");
      if (data.length > headerBytes) {
        const remaining = data.slice(headerBytes);
        // Push remaining data back so the consumer gets it
        process.nextTick(() => socket.emit("data", remaining));
      }

      resolve(socket);
    };

    socket.on("data", onData);
  });
}

export async function createTerminalSession(
  projectId: string,
  sessionId: string,
  containerId: string
): Promise<TerminalSession> {
  // Check for existing reconnectable session
  const existing = sessions.get(sessionId);
  if (existing?.alive && existing.disconnectedAt) {
    const elapsed = Date.now() - existing.disconnectedAt;
    if (elapsed < RECONNECT_WINDOW_MS) {
      existing.disconnectedAt = null;
      return existing;
    }
  }

  const docker = getDocker();
  const container = docker.getContainer(containerId);

  const exec = await container.exec({
    Cmd: ["tmux", "new-session", "-A", "-s", "main"],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: ["TERM=xterm-256color", "SHELL=/usr/bin/fish"],
  });

  // Use raw socket instead of dockerode's exec.start() which hangs under Bun
  const stream = await startExecRaw(exec.id);

  const session: TerminalSession = {
    projectId,
    sessionId,
    exec,
    stream,
    containerId,
    alive: true,
    disconnectedAt: null,
  };

  sessions.set(sessionId, session);

  // Track in DB
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO terminal_sessions (id, project_id, exec_id) VALUES (?, ?, ?)`,
    [sessionId, projectId, exec.id]
  );

  // Handle stream close
  stream.on("end", () => {
    session.alive = false;
    sessions.delete(sessionId);
    db.run(
      `UPDATE terminal_sessions SET ended_at = datetime('now') WHERE id = ?`,
      [sessionId]
    );
  });

  stream.on("close", () => {
    session.alive = false;
    sessions.delete(sessionId);
  });

  return session;
}

export function getTerminalSession(sessionId: string): TerminalSession | undefined {
  return sessions.get(sessionId);
}

export function markDisconnected(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.disconnectedAt = Date.now();
  }
}

export function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      session.stream.destroy();
    } catch {
      // Ignore
    }
    session.alive = false;
    sessions.delete(sessionId);
  }
}

export function destroyProjectSessions(projectId: string): void {
  for (const [id, session] of sessions) {
    if (session.projectId === projectId) {
      destroySession(id);
    }
  }
}

// Cleanup stale disconnected sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (
      session.disconnectedAt &&
      now - session.disconnectedAt > RECONNECT_WINDOW_MS
    ) {
      destroySession(id);
    }
  }
}, 30_000);
