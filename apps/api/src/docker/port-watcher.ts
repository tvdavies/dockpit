import { getDocker } from "./client";

const POLL_INTERVAL = 1500;
const EXCLUDED_PORTS = new Set([22]);
// Only forward ports in the typical dev server range, not ephemeral ports
const MAX_PORT = 32767;
// Require a port to be seen N consecutive times before reporting it
const STABLE_THRESHOLD = 2;
// Require a port to be absent N consecutive times before removing it
const ABSENT_THRESHOLD = 2;

let watchInterval: ReturnType<typeof setInterval> | null = null;
let currentContainerId: string | null = null;
let lastReportedPorts: number[] = [];
// Track how many consecutive polls each port has been seen/absent
const portSeenCount = new Map<number, number>();
const portAbsentCount = new Map<number, number>();
// Ports that have been "confirmed" (seen enough times)
const confirmedPorts = new Set<number>();

export function startWatching(
  containerId: string,
  onChange: (ports: number[]) => void,
  seedPorts?: number[]
): void {
  stopWatching();
  currentContainerId = containerId;
  lastReportedPorts = [];

  // Pre-seed previously known ports so they confirm after just one poll
  if (seedPorts) {
    for (const port of seedPorts) {
      portSeenCount.set(port, STABLE_THRESHOLD - 1);
    }
  }

  const poll = async () => {
    if (currentContainerId !== containerId) return;
    const rawPorts = await detectAllPorts(containerId);
    if (currentContainerId !== containerId) return;

    const currentSet = new Set(rawPorts);

    // Update seen/absent counts
    for (const port of currentSet) {
      portSeenCount.set(port, (portSeenCount.get(port) || 0) + 1);
      portAbsentCount.delete(port);
      if ((portSeenCount.get(port) || 0) >= STABLE_THRESHOLD) {
        confirmedPorts.add(port);
      }
    }

    for (const port of confirmedPorts) {
      if (!currentSet.has(port)) {
        portSeenCount.delete(port);
        portAbsentCount.set(port, (portAbsentCount.get(port) || 0) + 1);
        if ((portAbsentCount.get(port) || 0) >= ABSENT_THRESHOLD) {
          confirmedPorts.delete(port);
          portAbsentCount.delete(port);
        }
      }
    }

    const sorted = Array.from(confirmedPorts).sort((a, b) => a - b);
    const key = sorted.join(",");
    const lastKey = lastReportedPorts.join(",");

    if (key !== lastKey) {
      lastReportedPorts = sorted;
      onChange(sorted);
    }
  };

  // Poll immediately, then on interval
  poll();
  watchInterval = setInterval(poll, POLL_INTERVAL);
}

export function stopWatching(): void {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
  }
  currentContainerId = null;
  lastReportedPorts = [];
  portSeenCount.clear();
  portAbsentCount.clear();
  confirmedPorts.clear();
}

async function detectAllPorts(containerId: string): Promise<number[]> {
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

    const ports: number[] = [];
    for (const line of output.split("\n")) {
      const match = line.match(/:(\d+)\s/);
      if (match) {
        const port = parseInt(match[1], 10);
        if (port >= 1024 && port <= MAX_PORT && !EXCLUDED_PORTS.has(port)) {
          if (!ports.includes(port)) ports.push(port);
        }
      }
    }
    return ports;
  } catch {
    return [];
  }
}

function streamToString(stream: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString()));
    stream.on("error", reject);
  });
}
