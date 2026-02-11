import { getDocker } from "./client";
import { getDb } from "../db/schema";
import { broadcastEvent } from "../ws/events";

let eventStream: NodeJS.ReadableStream | null = null;

export function startDockerEventListener(): void {
  const docker = getDocker();

  docker.getEvents(
    {
      filters: {
        label: ["dockpit.managed=true"],
        type: ["container"],
        event: ["start", "stop", "die", "destroy", "pause", "unpause"],
      },
    },
    (err, stream) => {
      if (err) {
        console.error("Failed to listen for Docker events:", err);
        return;
      }
      if (!stream) return;

      eventStream = stream;
      stream.on("data", (chunk: Buffer) => {
        try {
          const event = JSON.parse(chunk.toString());
          handleDockerEvent(event);
        } catch {
          // Ignore parse errors
        }
      });
      stream.on("error", (err: Error) => {
        console.error("Docker event stream error:", err);
      });
      console.log("Docker event listener started");
    }
  );
}

function handleDockerEvent(event: any): void {
  const projectId = event.Actor?.Attributes?.["dockpit.project.id"];
  if (!projectId) return;

  const status = mapEventToStatus(event.Action);
  if (!status) return;

  // Update database
  const db = getDb();
  db.run(
    `UPDATE projects SET container_status = ?, updated_at = datetime('now') WHERE id = ?`,
    [status, projectId]
  );

  if (event.Action === "destroy") {
    db.run(
      `UPDATE projects SET container_id = NULL, updated_at = datetime('now') WHERE id = ?`,
      [projectId]
    );
  }

  // Broadcast to connected clients
  broadcastEvent({
    type: "container:event",
    projectId,
    status,
    containerId: event.Actor?.ID || "",
  });
}

function mapEventToStatus(action: string): string | null {
  switch (action) {
    case "start":
      return "running";
    case "stop":
    case "die":
      return "exited";
    case "destroy":
      return "not_created";
    case "pause":
      return "paused";
    case "unpause":
      return "running";
    default:
      return null;
  }
}

export function stopDockerEventListener(): void {
  if (eventStream) {
    (eventStream as any).destroy?.();
    eventStream = null;
  }
}
