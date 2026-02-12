import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { api } from "../../lib/api";
import type { GitHubRepo } from "@dockpit/shared";
import { generateWorkspaceId } from "@dockpit/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
      <DialogContent className="top-[20%] translate-y-0">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="local" className="min-w-0 overflow-hidden">
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
  const [sourceRepo, setSourceRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const createProject = useProjectStore((s) => s.createProject);

  const baseName = sourceRepo.trim().replace(/\/+$/, "").split("/").pop() || "";
  const workspaceId = useMemo(
    () => (baseName ? generateWorkspaceId(baseName) : ""),
    [baseName]
  );
  const defaultBranch = workspaceId ? `dockpit/${workspaceId}` : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceRepo.trim()) {
      setError("Source repo is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createProject({
        sourceRepo: sourceRepo.trim(),
        branch: branch.trim() || undefined,
        workspaceId: workspaceId || undefined,
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
        <Label htmlFor="source-repo">Source Git Repository</Label>
        <Input
          id="source-repo"
          value={sourceRepo}
          onChange={(e) => setSourceRepo(e.target.value)}
          placeholder="~/dev/my-app"
          className="font-mono"
          autoFocus
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
          placeholder={defaultBranch || "dockpit/{workspace-id}"}
          className="font-mono"
        />
        <p className="text-xs text-zinc-600">
          Optional. Defaults to {defaultBranch || "dockpit/{workspace-id}"}.
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [branch, setBranch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const createProjectFromGitHub = useProjectStore((s) => s.createProjectFromGitHub);

  const repoName = selectedRepo?.name || "";
  const workspaceId = useMemo(
    () => (repoName ? generateWorkspaceId(repoName) : ""),
    [repoName]
  );
  const defaultBranch = workspaceId ? `dockpit/${workspaceId}` : "";

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

  const handleSelectRepo = (fullName: string) => {
    const repo = repos.find((r) => r.fullName === fullName);
    if (!repo) return;
    setSelectedRepo(repo);
    setDropdownOpen(false);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepo) {
      setError("Select a repository");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await createProjectFromGitHub({
        repo: selectedRepo.fullName,
        branch: branch.trim() || undefined,
        workspaceId: workspaceId || undefined,
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

      <div className="space-y-2">
        <Label>Repository</Label>
        <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-transparent px-3 py-2 text-sm hover:border-zinc-700 transition-colors text-left"
            >
              {selectedRepo ? (
                <span className="truncate text-zinc-100">{selectedRepo.fullName}</span>
              ) : (
                <span className="text-zinc-500">Select a repository...</span>
              )}
              <svg className="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                value={query}
                onValueChange={handleSearchChange}
                placeholder="Search repositories..."
              />
              <CommandList className="max-h-48">
                {reposLoading ? (
                  <div className="py-4 text-center text-sm text-zinc-500">
                    Loading...
                  </div>
                ) : (
                  <CommandEmpty>No repositories found</CommandEmpty>
                )}
                <CommandGroup>
                  {repos.map((repo) => (
                    <CommandItem
                      key={repo.fullName}
                      value={repo.fullName}
                      onSelect={handleSelectRepo}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-zinc-100 truncate">
                            {repo.fullName}
                          </span>
                          {repo.isPrivate && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded shrink-0">
                              private
                            </span>
                          )}
                        </div>
                      </div>
                      {repo.language && (
                        <span className="text-[10px] text-zinc-500 shrink-0">
                          {repo.language}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {selectedRepo && (
        <div className="space-y-2">
          <Label htmlFor="gh-branch-name">Branch Name</Label>
          <Input
            id="gh-branch-name"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder={defaultBranch || "dockpit/{workspace-id}"}
            className="font-mono"
          />
          <p className="text-xs text-zinc-600">
            Optional. Defaults to {defaultBranch || "dockpit/{workspace-id}"}.
          </p>
        </div>
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
