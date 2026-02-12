import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { api } from "../../lib/api";
import type { GitHubRepo } from "@dockpit/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="local">
          <TabsList>
            <TabsTrigger value="local">Local Repo</TabsTrigger>
            <TabsTrigger value="github">From GitHub</TabsTrigger>
          </TabsList>
          <TabsContent value="local">
            <LocalTab onClose={() => onOpenChange(false)} />
          </TabsContent>
          <TabsContent value="github">
            <GitHubTab onClose={() => onOpenChange(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function LocalTab({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [sourceRepo, setSourceRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const createProject = useProjectStore((s) => s.createProject);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sourceRepo.trim()) {
      setError("Name and source repo are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createProject({
        name: name.trim(),
        sourceRepo: sourceRepo.trim(),
        branch: branch.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="project-name">Project Name</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-app"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="source-repo">Source Git Repository</Label>
        <Input
          id="source-repo"
          value={sourceRepo}
          onChange={(e) => setSourceRepo(e.target.value)}
          placeholder="~/dev/my-app"
          className="font-mono"
        />
        <p className="text-xs text-zinc-600">
          Path to a local git repo. A worktree will be created from it.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="branch-name">Branch Name</Label>
        <Input
          id="branch-name"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder={name ? `dockpit/${name}` : "dockpit/{project-name}"}
          className="font-mono"
        />
        <p className="text-xs text-zinc-600">
          Optional. Defaults to dockpit/{"{project-name}"}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Project"}
        </Button>
      </div>
    </form>
  );
}

function GitHubTab({ onClose }: { onClose: () => void }) {
  const [authChecking, setAuthChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const createProjectFromGitHub = useProjectStore((s) => s.createProjectFromGitHub);

  useEffect(() => {
    api.github.authStatus().then((status) => {
      setAuthenticated(status.authenticated);
      setUsername(status.username);
      setAuthChecking(false);
    }).catch(() => {
      setAuthChecking(false);
    });
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchRepos();
    }
  }, [authenticated]);

  const fetchRepos = useCallback(async (q?: string) => {
    setReposLoading(true);
    try {
      const result = await api.github.listRepos(q || undefined);
      setRepos(result.repos);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReposLoading(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchRepos(value);
    }, 300);
  };

  const handleSelectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setName(repo.name);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepo || !name.trim()) {
      setError("Select a repository and provide a name");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createProjectFromGitHub({
        name: name.trim(),
        repo: selectedRepo.fullName,
        branch: branch.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (authChecking) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        Checking GitHub authentication...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-sm text-zinc-400">
          GitHub CLI is not authenticated.
        </p>
        <p className="text-xs text-zinc-600 font-mono bg-zinc-950 inline-block px-3 py-1.5 rounded-lg">
          gh auth login
        </p>
        <p className="text-xs text-zinc-500">
          Run the command above in your terminal, then try again.
        </p>
        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {username && (
        <p className="text-xs text-zinc-500">
          Signed in as <span className="text-zinc-300">{username}</span>
        </p>
      )}

      <div>
        <Input
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search repositories..."
          autoFocus
        />
      </div>

      <div className="max-h-48 overflow-y-auto border border-zinc-800 rounded-lg divide-y divide-zinc-800/50">
        {reposLoading ? (
          <div className="py-6 text-center text-sm text-zinc-500">
            Loading repositories...
          </div>
        ) : repos.length === 0 ? (
          <div className="py-6 text-center text-sm text-zinc-500">
            No repositories found
          </div>
        ) : (
          repos.map((repo) => (
            <button
              key={repo.fullName}
              type="button"
              onClick={() => handleSelectRepo(repo)}
              className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer ${
                selectedRepo?.fullName === repo.fullName
                  ? "bg-blue-500/10 border-l-2 border-l-blue-500"
                  : "hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-100 truncate">
                  {repo.fullName}
                </span>
                {repo.isPrivate && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                    private
                  </span>
                )}
              </div>
              {repo.description && (
                <p className="text-xs text-zinc-500 truncate mt-0.5">
                  {repo.description}
                </p>
              )}
              {repo.language && (
                <span className="text-[10px] text-zinc-600 mt-0.5 inline-block">
                  {repo.language}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {selectedRepo && (
        <>
          <div className="space-y-2">
            <Label htmlFor="gh-project-name">Project Name</Label>
            <Input
              id="gh-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gh-branch-name">Branch Name</Label>
            <Input
              id="gh-branch-name"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={name ? `dockpit/${name}` : "dockpit/{project-name}"}
              className="font-mono"
            />
            <p className="text-xs text-zinc-600">
              Optional. Defaults to dockpit/{"{project-name}"}
            </p>
          </div>
        </>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading || !selectedRepo}>
          {loading ? "Creating..." : "Create Project"}
        </Button>
      </div>
    </form>
  );
}
