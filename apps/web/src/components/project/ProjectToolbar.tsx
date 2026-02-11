import { useNavigate } from "react-router-dom";
import type { Project } from "@dockpit/shared";
import { useProjectStore } from "../../stores/projectStore";
import { ContainerStatusBadge } from "../dashboard/ContainerStatusBadge";
import { useState } from "react";

interface Props {
  project: Project;
  showGit: boolean;
  onToggleGit: () => void;
}

export function ProjectToolbar({ project, showGit, onToggleGit }: Props) {
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
    <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
      {/* Back */}
      <button
        onClick={() => navigate("/")}
        className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Project info */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-zinc-100 text-sm truncate">
          {project.name}
        </span>
        <ContainerStatusBadge status={project.containerStatus} />
      </div>

      <div className="flex-1" />

      {/* Container actions */}
      <div className="flex items-center gap-1">
        {!isRunning && (
          <button
            onClick={() => handleAction(startContainer)}
            disabled={actionLoading}
            className="px-3 py-1 text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            Start
          </button>
        )}
        {isRunning && (
          <>
            <button
              onClick={() => handleAction(restartContainer)}
              disabled={actionLoading}
              className="px-3 py-1 text-xs font-medium bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              Restart
            </button>
            <button
              onClick={() => handleAction(stopContainer)}
              disabled={actionLoading}
              className="px-3 py-1 text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              Stop
            </button>
          </>
        )}
      </div>

      {/* Git toggle */}
      <button
        onClick={onToggleGit}
        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
          showGit
            ? "bg-blue-500/20 text-blue-400"
            : "bg-zinc-800 text-zinc-400 hover:text-zinc-300"
        }`}
      >
        Git
      </button>
    </div>
  );
}
