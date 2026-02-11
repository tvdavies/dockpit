export interface Project {
  id: string;
  name: string;
  directory: string;
  containerId: string | null;
  containerStatus: string;
  previewPort: number | null;
  githubRepo: string | null;
  sourceRepo: string | null;
  worktreeBranch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  sourceRepo: string;
  branch?: string;
}

export interface UpdateProjectInput {
  name?: string;
  previewPort?: number | null;
}

export interface CreateProjectFromGitHubInput {
  name: string;
  repo: string;
  branch?: string;
}
