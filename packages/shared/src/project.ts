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
  sourceRepo: string;
  branch?: string;
  workspaceId?: string;
}

export interface UpdateProjectInput {
  name?: string;
  previewPort?: number | null;
}

export interface CreateProjectFromGitHubInput {
  repo: string;
  branch?: string;
  workspaceId?: string;
}

export function generateWorkspaceId(baseName: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let suffix = "";
  for (const b of bytes) suffix += chars[b % chars.length];
  return `${baseName}-${suffix}`;
}
