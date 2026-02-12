import { getDb } from "../db/schema";
import type { Project, CreateProjectInput, UpdateProjectInput, CreateProjectFromGitHubInput } from "@dockpit/shared";
import { generateWorkspaceId } from "@dockpit/shared";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import { cloneGhRepo } from "./github";
import { createWorktree, removeWorktree } from "./worktree";

function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db.query("SELECT * FROM projects ORDER BY created_at DESC").all() as any[];
  return rows.map(rowToProject);
}

export function getProject(id: string): Project | null {
  const db = getDb();
  const row = db.query("SELECT * FROM projects WHERE id = ?").get(id) as any;
  return row ? rowToProject(row) : null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const db = getDb();

  const sourceRepo = expandHome(input.sourceRepo);

  // Validate source repo exists and has .git
  if (!existsSync(sourceRepo)) {
    throw new ValidationError(`Directory does not exist: ${input.sourceRepo}`);
  }
  if (!existsSync(join(sourceRepo, ".git"))) {
    throw new ValidationError(`Not a git repository: ${input.sourceRepo}`);
  }

  const baseName = basename(sourceRepo);
  const workspaceId = input.workspaceId || generateWorkspaceId(baseName);
  const branch = input.branch || `dockpit/${workspaceId}`;
  const worktreePath = await createWorktree(sourceRepo, workspaceId, branch);

  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO projects (id, name, directory, source_repo, worktree_branch) VALUES (?, ?, ?, ?, ?)`,
    [id, workspaceId, worktreePath, sourceRepo, branch]
  );

  return getProject(id)!;
}

export async function createProjectFromGitHub(input: CreateProjectFromGitHubInput): Promise<Project> {
  const db = getDb();

  // Clone the repo (always to ~/dev/{repo})
  const clonedDir = await cloneGhRepo(input.repo);

  // Extract repo name from "owner/repo"
  const repoName = input.repo.split("/").pop()!;
  const workspaceId = input.workspaceId || generateWorkspaceId(repoName);
  const branch = input.branch || `dockpit/${workspaceId}`;
  const worktreePath = await createWorktree(clonedDir, workspaceId, branch);

  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO projects (id, name, directory, github_repo, source_repo, worktree_branch) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, workspaceId, worktreePath, input.repo, clonedDir, branch]
  );

  return getProject(id)!;
}

export function updateProject(id: string, input: UpdateProjectInput): Project {
  const db = getDb();
  const project = getProject(id);
  if (!project) throw new NotFoundError("Project not found");

  if (input.name !== undefined) {
    const existing = db
      .query("SELECT id FROM projects WHERE name = ? AND id != ?")
      .get(input.name, id);
    if (existing) {
      throw new ValidationError(`Project name already exists: ${input.name}`);
    }
    db.run(
      `UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?`,
      [input.name, id]
    );
  }

  if (input.previewPort !== undefined) {
    db.run(
      `UPDATE projects SET preview_port = ?, updated_at = datetime('now') WHERE id = ?`,
      [input.previewPort, id]
    );
  }

  return getProject(id)!;
}

export async function deleteProject(id: string, keepWorktree?: boolean): Promise<void> {
  const db = getDb();
  const project = getProject(id);
  if (!project) throw new NotFoundError("Project not found");

  // Remove worktree if requested and project has one
  if (!keepWorktree && project.sourceRepo) {
    await removeWorktree(project.sourceRepo, project.directory);
  }

  const result = db.run("DELETE FROM projects WHERE id = ?", [id]);
  if (result.changes === 0) throw new NotFoundError("Project not found");
}

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    directory: row.directory,
    containerId: row.container_id,
    containerStatus: row.container_status,
    previewPort: row.preview_port,
    githubRepo: row.github_repo ?? null,
    sourceRepo: row.source_repo ?? null,
    worktreeBranch: row.worktree_branch ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getDetectedPorts(projectId: string): number[] {
  const db = getDb();
  const row = db.query("SELECT detected_ports FROM projects WHERE id = ?").get(projectId) as any;
  if (!row?.detected_ports) return [];
  try { return JSON.parse(row.detected_ports); } catch { return []; }
}

export function setDetectedPorts(projectId: string, ports: number[]): void {
  const db = getDb();
  db.run("UPDATE projects SET detected_ports = ? WHERE id = ?", [JSON.stringify(ports), projectId]);
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
