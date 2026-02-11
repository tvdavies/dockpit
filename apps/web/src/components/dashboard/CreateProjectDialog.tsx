import { useState, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "../../stores/projectStore";
import { api } from "../../lib/api";
import type { GitHubRepo } from "@dockpit/shared";

interface Props {
  onClose: () => void;
}

type Tab = "local" | "github";

export function CreateProjectDialog({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("local");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">
          New Project
        </h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-950 rounded-lg p-1">
          <button
            onClick={() => setTab("local")}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              tab === "local"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Local Repo
          </button>
          <button
            onClick={() => setTab("github")}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              tab === "github"
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            From GitHub
          </button>
        </div>

        {tab === "local" ? (
          <LocalTab onClose={onClose} />
        ) : (
          <GitHubTab onClose={onClose} />
        )}
      </div>
    </div>
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
      <div>
        <label className="block text-sm text-zinc-400 mb-1.5">
          Project Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-app"
          autoFocus
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-zinc-400 mb-1.5">
          Source Git Repository
        </label>
        <input
          type="text"
          value={sourceRepo}
          onChange={(e) => setSourceRepo(e.target.value)}
          placeholder="~/dev/my-app"
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
        />
        <p className="text-xs text-zinc-600 mt-1">
          Path to a local git repo. A worktree will be created from it.
        </p>
      </div>

      <div>
        <label className="block text-sm text-zinc-400 mb-1.5">
          Branch Name
        </label>
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder={name ? `dockpit/${name}` : "dockpit/{project-name}"}
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
        />
        <p className="text-xs text-zinc-600 mt-1">
          Optional. Defaults to dockpit/{"{project-name}"}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Creating..." : "Create Project"}
        </button>
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

  // Check auth on mount
  useEffect(() => {
    api.github.authStatus().then((status) => {
      setAuthenticated(status.authenticated);
      setUsername(status.username);
      setAuthChecking(false);
    }).catch(() => {
      setAuthChecking(false);
    });
  }, []);

  // Fetch repos when authenticated
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
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Close
          </button>
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

      {/* Search */}
      <div>
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search repositories..."
          autoFocus
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm"
        />
      </div>

      {/* Repo list */}
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

      {/* Name and branch fields (shown after selection) */}
      {selectedRepo && (
        <>
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">
              Branch Name
            </label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={name ? `dockpit/${name}` : "dockpit/{project-name}"}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-500 text-sm font-mono"
            />
            <p className="text-xs text-zinc-600 mt-1">
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
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !selectedRepo}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? "Creating..." : "Create Project"}
        </button>
      </div>
    </form>
  );
}
