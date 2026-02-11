import { getDocker } from "./client";

// Common dev server port patterns in log output
const PORT_PATTERNS = [
  /(?:listening|running|started|ready|server|available)\s+(?:on|at)\s+(?:https?:\/\/)?(?:localhost|0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d+)/i,
  /(?:local|network):\s+https?:\/\/(?:localhost|0\.0\.0\.0|127\.0\.0\.1|\[::\]):(\d+)/i,
  /port\s+(\d+)/i,
  /:(\d{4,5})\/?[\s)]*$/m,
];

export async function detectPort(containerId: string): Promise<number | null> {
  // Try log scanning first
  const port = await detectFromLogs(containerId);
  if (port) return port;

  // Fallback: ss -tlnp inside container
  return detectFromSs(containerId);
}

async function detectFromLogs(containerId: string): Promise<number | null> {
  const docker = getDocker();
  const container = docker.getContainer(containerId);

  try {
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 50,
      timestamps: false,
    });

    const text = logs.toString();
    for (const pattern of PORT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const port = parseInt(match[1], 10);
        if (port > 0 && port < 65536) return port;
      }
    }
  } catch {
    // Container might not be running
  }

  return null;
}

async function detectFromSs(containerId: string): Promise<number | null> {
  const docker = getDocker();
  const container = docker.getContainer(containerId);

  try {
    const exec = await container.exec({
      Cmd: ["ss", "-tlnp"],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    const output = await streamToString(stream);

    // Parse ss output for listening ports, skip common system ports
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/:(\d+)\s/);
      if (match) {
        const port = parseInt(match[1], 10);
        if (port >= 3000 && port < 65536) return port;
      }
    }
  } catch {
    // ss might not be available
  }

  return null;
}

function streamToString(stream: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString()));
    stream.on("error", reject);
  });
}
