import { useEffect } from "react";
import { useWebSocket } from "./useWebSocket";
import { createEventsWsUrl } from "../lib/ws-protocol";
import { useProjectStore } from "../stores/projectStore";

export function useContainerStatus() {
  const updateProjectStatus = useProjectStore((s) => s.updateProjectStatus);

  const { connected } = useWebSocket({
    url: createEventsWsUrl(),
    onMessage: (event) => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "container:event") {
          updateProjectStatus(msg.projectId, msg.status);
        }
      } catch {
        // Ignore
      }
    },
  });

  return { connected };
}
