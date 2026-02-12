import { useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { createEventsWsUrl } from "../lib/ws-protocol";
import { useProjectStore } from "../stores/projectStore";
import { addToast } from "../stores/toastStore";
import {
  getAgentSnapshot,
  subscribeAgent,
  sendToAgent,
  killAgent as killAgentFn,
} from "../lib/agent-connection";

// Global set of ports we've already toasted — survives hook remounts / strict mode.
// Cleared when the focused project changes.
const toastedPorts = new Set<number>();
let toastedForProject: string | undefined;

export function useContainerStatus(projectId?: string) {
  const updateProjectStatus = useProjectStore((s) => s.updateProjectStatus);
  const prevPortsRef = useRef<string>("");

  // --- Agent state (singleton, instant) ---

  const { connected: agentConnected, ports: tunnelPorts } = useSyncExternalStore(
    subscribeAgent,
    getAgentSnapshot,
  );

  // --- Events WS (server): container events + project focus ---

  const onEventsMessage = useCallback((event: MessageEvent) => {
    if (typeof event.data !== "string") return;
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "container:event") {
        updateProjectStatus(msg.projectId, msg.status);
      }
    } catch {}
  }, [updateProjectStatus]);

  const { connected, send } = useWebSocket({
    url: createEventsWsUrl(),
    onMessage: onEventsMessage,
  });

  // Send project focus to server when projectId changes or ws connects
  // Also re-assert every 30s so the server re-sends ports to the agent
  useEffect(() => {
    if (!connected) return;

    if (!projectId) {
      send(JSON.stringify({ type: "project:focus", projectId: null }));
      return;
    }

    const focusMsg = JSON.stringify({ type: "project:focus", projectId });
    send(focusMsg);

    const interval = setInterval(() => send(focusMsg), 30_000);

    return () => {
      clearInterval(interval);
      send(JSON.stringify({ type: "project:focus", projectId: null }));
    };
  }, [connected, projectId, send]);

  // Send project focus to agent for optimistic tunnels
  // Re-fires on agent reconnect so tunnels get recreated
  useEffect(() => {
    // Reset toast tracking when project changes
    if (toastedForProject !== projectId) {
      toastedPorts.clear();
      toastedForProject = projectId;
      // Pre-seed with any ports already listening so we don't re-toast them
      for (const tp of getAgentSnapshot().ports) {
        if (tp.status === "listening") toastedPorts.add(tp.port);
      }
    }
    sendToAgent(JSON.stringify({ type: "project:focus", projectId: projectId || null }));
  }, [projectId, agentConnected]);

  // Toast for newly listening ports (project view only)
  useEffect(() => {
    if (!projectId) return;

    const key = JSON.stringify(tunnelPorts);
    if (key === prevPortsRef.current) return;
    prevPortsRef.current = key;

    for (const tp of tunnelPorts) {
      if (tp.status === "listening" && !toastedPorts.has(tp.port)) {
        toastedPorts.add(tp.port);
        const url = `http://localhost:${tp.localPort}`;
        addToast({
          message: tp.localPort === tp.port
            ? `Port ${tp.port} ready`
            : `Port ${tp.port} ready on`,
          url,
        });
      }
    }
  }, [projectId, tunnelPorts]);

  const disconnectPort = useCallback((port: number) => {
    send(JSON.stringify({ type: "tunnel:disconnect", port }));
  }, [send]);

  return { connected, agentConnected, tunnelPorts, disconnectPort, killAgent: killAgentFn };
}
