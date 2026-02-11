import { useState } from "react";
import type { Project } from "@dockpit/shared";
import { api } from "../../lib/api";
import { useProjectStore } from "../../stores/projectStore";

interface Props {
  project: Project;
}

export function WebPreviewPane({ project }: Props) {
  const [manualPort, setManualPort] = useState("");
  const [loading, setLoading] = useState(false);
  const updateProject = useProjectStore((s) => s.updateProject);
  const isRunning = project.containerStatus === "running";

  const previewUrl = `/preview/${project.id}/`;

  const handleSetPort = async () => {
    const port = parseInt(manualPort, 10);
    if (!port || port < 1 || port > 65535) return;
    setLoading(true);
    try {
      const updated = await api.projects.update(project.id, {
        previewPort: port,
      });
      updateProject(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isRunning) {
    return (
      <div className="h-full bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500 text-sm">No preview available</p>
          <p className="text-zinc-600 text-xs mt-1">
            Start a dev server in the terminal
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-zinc-950 flex flex-col">
      {/* Preview toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-800">
        <span className="text-xs text-zinc-500">Preview</span>
        <div className="flex-1" />
        <input
          type="number"
          value={manualPort}
          onChange={(e) => setManualPort(e.target.value)}
          placeholder={project.previewPort?.toString() || "Port"}
          className="w-20 px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleSetPort}
          disabled={loading}
          className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded transition-colors cursor-pointer disabled:opacity-50"
        >
          Set
        </button>
        <button
          onClick={() => {
            const iframe = document.querySelector(
              `iframe[data-project="${project.id}"]`
            ) as HTMLIFrameElement;
            if (iframe) iframe.src = previewUrl;
          }}
          className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-300 rounded transition-colors cursor-pointer"
        >
          Reload
        </button>
      </div>

      {/* Iframe */}
      <div className="flex-1 min-h-0">
        <iframe
          data-project={project.id}
          src={previewUrl}
          className="w-full h-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="Web Preview"
        />
      </div>
    </div>
  );
}
