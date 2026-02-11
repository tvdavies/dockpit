export interface Project {
  id: string;
  name: string;
  directory: string;
  containerId: string | null;
  containerStatus: string;
  previewPort: number | null;
  githubRepo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  directory: string;
}

export interface UpdateProjectInput {
  name?: string;
  previewPort?: number | null;
}

export interface CreateProjectFromGitHubInput {
  name: string;
  repo: string;
  directory?: string;
}
