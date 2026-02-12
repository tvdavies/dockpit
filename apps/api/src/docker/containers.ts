import type Docker from "dockerode";
import { getDocker, NETWORK_NAME } from "./client";
import { getDb } from "../db/schema";
import { homedir } from "os";
import { resolve } from "path";
import type { ContainerInfo, ContainerStatus } from "@dockpit/shared";

const IMAGE_NAME = "dockpit-devenv:latest";

export async function ensureImage(): Promise<void> {
  const docker = getDocker();
  const images = await docker.listImages({
    filters: { reference: [IMAGE_NAME] },
  });
  if (images.length === 0) {
    console.log("Building dockpit-devenv image...");
    const proc = Bun.spawn(
      ["docker", "build", "-t", IMAGE_NAME, "-f", "Dockerfile.devenv", "."],
      { cwd: resolve(import.meta.dir, "../../../../docker"), stdout: "pipe", stderr: "pipe" }
    );
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Image build failed: ${stderr}`);
    }
    console.log("Image built:", IMAGE_NAME);
  }
}

export async function createAndStartContainer(
  projectId: string,
  projectName: string,
  directory: string
): Promise<string> {
  const docker = getDocker();
  await ensureImage();

  // Remove any stale container with the same name
  const containerName = `dockpit-${projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
  try {
    const stale = docker.getContainer(containerName);
    await stale.remove({ force: true });
  } catch {
    // No stale container
  }

  const container = await docker.createContainer({
    Image: IMAGE_NAME,
    name: containerName,
    Labels: {
      "dockpit.managed": "true",
      "dockpit.project.id": projectId,
      "dockpit.project.name": projectName,
    },
    Env: [
      `DOCKPIT_CONTAINER=${containerName}`,
    ],
    Tty: true,
    OpenStdin: true,
    Cmd: ["sh", "-c", "sudo chown -R dev:dev /workspace && sudo sh -c 'dockerd >/tmp/dockerd.log 2>&1' & while ! docker info >/dev/null 2>&1; do sleep 0.5; done && sudo chmod 666 /var/run/docker.sock && exec sleep infinity"],
    HostConfig: {
      Binds: [
        `${directory}:/workspace:rw`,
        `${homedir()}/.config/fish/:/home/dev/.config/fish/:rw`,
        `${homedir()}/.config/gh/:/home/dev/.config/gh/:rw`,
        `${homedir()}/.claude/:/home/dev/.claude/:rw`,
        `${homedir()}/.claude.json:/home/dev/.claude.json:rw`,
        `${homedir()}/.tmux.conf:/home/dev/.tmux.conf:rw`,
        `${containerName}-docker:/var/lib/docker:rw`,
      ],
      Privileged: true,
      NetworkMode: NETWORK_NAME,
      ExtraHosts: ["host.docker.internal:host-gateway"],
    },
    WorkingDir: "/workspace",
  });

  await container.start();
  const info = await container.inspect();
  const containerId = info.Id;

  const db = getDb();
  db.run(
    `UPDATE projects SET container_id = ?, container_status = 'running', updated_at = datetime('now') WHERE id = ?`,
    [containerId, projectId]
  );

  return containerId;
}

export async function stopContainer(projectId: string): Promise<void> {
  const db = getDb();
  const project = db
    .query<{ container_id: string | null }, [string]>(
      "SELECT container_id FROM projects WHERE id = ?"
    )
    .get(projectId);

  if (!project?.container_id) return;

  const docker = getDocker();
  const container = docker.getContainer(project.container_id);

  try {
    await container.stop({ t: 5 });
  } catch {
    // Already stopped
  }
  try {
    await container.remove({ force: true });
  } catch {
    // Already removed
  }

  db.run(
    `UPDATE projects SET container_id = NULL, container_status = 'exited', updated_at = datetime('now') WHERE id = ?`,
    [projectId]
  );
}

export async function restartContainer(projectId: string): Promise<string> {
  const db = getDb();
  const project = db
    .query<{ name: string; directory: string }, [string]>(
      "SELECT name, directory FROM projects WHERE id = ?"
    )
    .get(projectId);

  if (!project) throw new Error("Project not found");

  await stopContainer(projectId);
  return createAndStartContainer(projectId, project.name, project.directory);
}

export async function getContainerInfo(
  containerId: string
): Promise<ContainerInfo | null> {
  const docker = getDocker();
  try {
    const info = await docker.getContainer(containerId).inspect();
    const networkSettings = info.NetworkSettings.Networks[NETWORK_NAME];
    return {
      id: info.Id,
      status: info.State.Status as ContainerStatus,
      ip: networkSettings?.IPAddress || null,
      startedAt: info.State.StartedAt || null,
    };
  } catch {
    return null;
  }
}

export async function getContainerLogs(
  containerId: string,
  lines: number = 100
): Promise<string[]> {
  const docker = getDocker();
  const container = docker.getContainer(containerId);
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail: lines,
    timestamps: false,
  });

  // Docker logs come with 8-byte header per frame in non-TTY mode
  // For TTY containers, it's just raw text
  return logs
    .toString()
    .split("\n")
    .filter((l: string) => l.length > 0);
}

export async function getTerminalPreview(
  containerId: string,
  lines: number = 5
): Promise<string[]> {
  const docker = getDocker();
  const container = docker.getContainer(containerId);

  try {
    const exec = await container.exec({
      Cmd: ["tmux", "capture-pane", "-t", "main", "-p", "-S", `-${lines}`],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    const output = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString()));
      stream.on("error", reject);
    });

    // Split and trim trailing empty lines
    const result = output.split("\n");
    while (result.length > 0 && result[result.length - 1].trim() === "") {
      result.pop();
    }
    return result;
  } catch {
    return [];
  }
}

export { IMAGE_NAME };
