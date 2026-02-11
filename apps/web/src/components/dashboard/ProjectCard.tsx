import { useNavigate } from "react-router-dom";
import type { Project } from "@dockpit/shared";
import { useProjectStore } from "../../stores/projectStore";
import { ContainerStatusBadge } from "./ContainerStatusBadge";
import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";

export function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate();
  const { startContainer, stopContainer, deleteProject } = useProjectStore();
  const [actionLoading, setActionLoading] = useState(false);

  const isRunning = project.containerStatus === "running";
  const [previewLines, setPreviewLines] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRunning) {
      setPreviewLines([]);
      return;
    }

    const fetchPreview = () => {
      api.containers.terminalPreview(project.id).then(
        (data) => setPreviewLines(data.lines),
        () => {}
      );
    };

    fetchPreview();
    intervalRef.current = setInterval(fetchPreview, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, project.id]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoading(true);
    try {
      if (isRunning) {
        await stopContainer(project.id);
      } else {
        await startContainer(project.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete project "${project.name}"?`)) return;
    try {
      await deleteProject(project.id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      onClick={() => navigate(`/project/${project.id}`)}
      className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-zinc-100 truncate">{project.name}</h3>
          <p className="text-xs text-zinc-500 truncate mt-0.5" title={project.directory}>
            {project.directory}
          </p>
          {project.githubRepo && (
            <div className="flex items-center gap-1 mt-1">
              <svg className="w-3 h-3 text-zinc-500" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <span className="text-[10px] text-zinc-500 truncate">{project.githubRepo}</span>
            </div>
          )}
        </div>
        <ContainerStatusBadge status={project.containerStatus} />
      </div>

      {/* Terminal preview */}
      <div className="bg-zinc-950 rounded-lg h-24 mb-4 border border-zinc-800/50 overflow-hidden">
        {isRunning && previewLines.length > 0 ? (
          <pre className="p-2 text-[10px] leading-tight text-zinc-400 font-mono whitespace-pre overflow-hidden h-full">
            {previewLines.join("\n")}
          </pre>
        ) : isRunning ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs text-zinc-600 font-mono">
              <span className="text-emerald-500">$</span> _
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-zinc-700">Container stopped</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={actionLoading}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
            isRunning
              ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
              : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          }`}
        >
          {actionLoading ? "..." : isRunning ? "Stop" : "Start"}
        </button>
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 text-xs text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
