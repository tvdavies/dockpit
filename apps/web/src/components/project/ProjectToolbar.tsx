import { useNavigate } from "react-router-dom";
import type { Project, TunnelPortStatus } from "@dockpit/shared";
import { useProjectStore } from "../../stores/projectStore";
import { TunnelStatus } from "./TunnelStatus";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  project: Project;
  showGit: boolean;
  onToggleGit: () => void;
  agentConnected: boolean | null;
  tunnelPorts: TunnelPortStatus[];
  onDisconnectPort: (port: number) => void;
  onKillAgent: () => void;
}

export function ProjectToolbar({ project, showGit, onToggleGit, agentConnected, tunnelPorts, onDisconnectPort, onKillAgent }: Props) {
  const navigate = useNavigate();
  const { startContainer, stopContainer, restartContainer } = useProjectStore();
  const [actionLoading, setActionLoading] = useState(false);
  const isRunning = project.containerStatus === "running";

  const handleAction = async (
    action: (id: string) => Promise<void>
  ) => {
    setActionLoading(true);
    try {
      await action(project.id);
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
      {/* Back */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate("/")}
        className="h-7 w-7"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Project name + status indicators */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-zinc-100 text-sm truncate">
          {project.name}
        </span>
        <TunnelStatus agentConnected={agentConnected} tunnelPorts={tunnelPorts} onDisconnectPort={onDisconnectPort} onKillAgent={onKillAgent} />
      </div>

      <div className="flex-1" />

      {/* Container actions */}
      <div className="flex items-center gap-1">
        {!isRunning && (
          <Button
            variant="success"
            size="sm"
            onClick={() => handleAction(startContainer)}
            disabled={actionLoading}
          >
            Start
          </Button>
        )}
        {isRunning && (
          <>
            <Button
              variant="warning"
              size="sm"
              onClick={() => handleAction(restartContainer)}
              disabled={actionLoading}
            >
              Restart
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleAction(stopContainer)}
              disabled={actionLoading}
            >
              Stop
            </Button>
          </>
        )}
      </div>

      {/* Git toggle */}
      <Button
        variant={showGit ? "default" : "secondary"}
        size="sm"
        onClick={onToggleGit}
        className={showGit ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : ""}
      >
        Git
      </Button>
    </div>
  );
}
