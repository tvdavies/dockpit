import type Docker from "dockerode";
import { getDocker, NETWORK_NAME } from "./client";
import { getDb } from "../db/schema";
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
      { cwd: "/home/tvd/dev/dockpit/docker", stdout: "pipe", stderr: "pipe" }
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

  const container = await docker.createContainer({
    Image: IMAGE_NAME,
    name: `dockpit-${projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`,
    Labels: {
      "dockpit.managed": "true",
      "dockpit.project.id": projectId,
      "dockpit.project.name": projectName,
    },
    Tty: true,
    OpenStdin: true,
    Cmd: ["/bin/bash", "-c", "sleep infinity"],
    HostConfig: {
      Binds: [`${directory}:/workspace:rw`],
      NetworkMode: NETWORK_NAME,
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

export { IMAGE_NAME };
