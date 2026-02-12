import { useState } from "react";
import { useProjects } from "../../hooks/useProjects";
import { useContainerStatus } from "../../hooks/useContainerStatus";
import { ProjectCard } from "./ProjectCard";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { ConnectionStatus } from "./ConnectionStatus";
import { Button } from "@/components/ui/button";

export function Dashboard() {
  const { projects, loading, error } = useProjects();
  const { connected, agentConnected, tunnelPorts, disconnectPort, killAgent } = useContainerStatus();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-zinc-100">Dockpit</h1>
            <ConnectionStatus
              apiConnected={connected}
              agentConnected={agentConnected}
              tunnelPorts={tunnelPorts}
              onDisconnectPort={disconnectPort}
              onKillAgent={killAgent}
            />
          </div>
          <Button onClick={() => setShowCreate(true)}>
            New Project
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading && projects.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 bg-zinc-900 rounded-2xl flex items-center justify-center">
              <svg
                className="w-8 h-8 text-zinc-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-zinc-300 mb-2">
              No projects yet
            </h2>
            <p className="text-zinc-500 mb-6">
              Create your first project to get started with isolated dev
              environments.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              Create Project
            </Button>
          </div>
        )}

        {projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>

      <CreateProjectDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
