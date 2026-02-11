import type { Project } from "./project";

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  details?: string;
}

export type ProjectsResponse = ApiResponse<Project[]>;
export type ProjectResponse = ApiResponse<Project>;

export interface ContainerLogsResponse {
  data: {
    lines: string[];
  };
}

export interface GitStatusResponse {
  data: {
    branch: string;
    staged: string[];
    modified: string[];
    untracked: string[];
    ahead: number;
    behind: number;
  };
}

export interface GitDiffResponse {
  data: {
    diff: string;
    files: Array<{
      path: string;
      status: string;
      additions: number;
      deletions: number;
    }>;
  };
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitLogResponse {
  data: {
    entries: GitLogEntry[];
  };
}

export interface GitHubRepo {
  fullName: string;
  name: string;
  owner: string;
  description: string | null;
  isPrivate: boolean;
  defaultBranch: string;
  language: string | null;
  url: string;
}

export interface GitHubAuthStatusResponse {
  authenticated: boolean;
  username: string | null;
}
