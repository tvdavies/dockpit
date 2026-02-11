import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useProjectStore } from "../../stores/projectStore";
import { useContainerStatus } from "../../hooks/useContainerStatus";
import { api } from "../../lib/api";
import { TerminalPane } from "./TerminalPane";
import { WebPreviewPane } from "./WebPreviewPane";
import { GitDiffPanel } from "./GitDiffPanel";
import { ProjectToolbar } from "./ProjectToolbar";
import type { Project } from "@dockpit/shared";

export function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGit, setShowGit] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { updateProject } = useProjectStore();

  useContainerStatus();

  // Sync from store
  const storeProject = useProjectStore((s) =>
    s.projects.find((p) => p.id === id)
  );

  useEffect(() => {
    if (storeProject) setProject(storeProject);
  }, [storeProject]);

  useEffect(() => {
    if (!id) return;
    api.projects
      .get(id)
      .then((p) => {
        setProject(p);
        updateProject(p);
      })
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));
  }, [id]);

  const sessionId = useMemo(
    () => Math.random().toString(36).slice(2) + Date.now().toString(36),
    [id]
  );

  if (loading || !project) {
    return (
      <div className="h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  const isRunning = project.containerStatus === "running";

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
      <ProjectToolbar
        project={project}
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview(!showPreview)}
        showGit={showGit}
        onToggleGit={() => setShowGit(!showGit)}
      />

      <div className="flex-1 min-h-0">
        <PanelGroup direction="vertical">
          <Panel defaultSize={showGit ? 70 : 100} minSize={30}>
            <PanelGroup direction="horizontal">
              {/* Terminal */}
              <Panel defaultSize={showPreview ? 60 : 100} minSize={30}>
                <TerminalPane
                  projectId={project.id}
                  sessionId={sessionId}
                  isRunning={isRunning}
                />
              </Panel>

              {showPreview && (
                <>
                  <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-blue-500 transition-colors" />

                  {/* Web Preview */}
                  <Panel defaultSize={40} minSize={20}>
                    <WebPreviewPane project={project} />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {showGit && (
            <>
              <PanelResizeHandle className="h-1 bg-zinc-800 hover:bg-blue-500 transition-colors" />
              <Panel defaultSize={30} minSize={15}>
                <GitDiffPanel projectId={project.id} />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}
