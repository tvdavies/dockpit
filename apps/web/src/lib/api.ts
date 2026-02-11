import type {
  Project,
  CreateProjectInput,
  CreateProjectFromGitHubInput,
  UpdateProjectInput,
  ApiResponse,
  GitStatusResponse,
  GitDiffResponse,
  GitLogResponse,
  ContainerLogsResponse,
  GitHubRepo,
  GitHubAuthStatusResponse,
} from "@dockpit/shared";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.data;
}

export const api = {
  projects: {
    list: () => request<Project[]>("/projects"),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (input: CreateProjectInput) =>
      request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    update: (id: string, input: UpdateProjectInput) =>
      request<Project>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
    createFromGitHub: (input: CreateProjectFromGitHubInput) =>
      request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },

  containers: {
    start: (id: string) =>
      request<Project>(`/projects/${id}/start`, { method: "POST" }),
    stop: (id: string) =>
      request<Project>(`/projects/${id}/stop`, { method: "POST" }),
    restart: (id: string) =>
      request<Project>(`/projects/${id}/restart`, { method: "POST" }),
    logs: (id: string, lines = 100) =>
      request<ContainerLogsResponse["data"]>(
        `/projects/${id}/logs?lines=${lines}`
      ),
  },

  github: {
    authStatus: () => request<GitHubAuthStatusResponse>("/github/auth"),
    listRepos: (q?: string, limit?: number) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      return request<{ repos: GitHubRepo[]; hasMore: boolean }>(`/github/repos${qs ? `?${qs}` : ""}`);
    },
  },

  git: {
    status: (id: string) =>
      request<GitStatusResponse["data"]>(`/projects/${id}/git/status`),
    diff: (id: string) =>
      request<GitDiffResponse["data"]>(`/projects/${id}/git/diff`),
    log: (id: string, limit = 20) =>
      request<GitLogResponse["data"]>(
        `/projects/${id}/git/log?limit=${limit}`
      ),
  },
};
