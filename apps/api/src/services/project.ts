import { getDb } from "../db/schema";
import type { Project, CreateProjectInput, UpdateProjectInput, CreateProjectFromGitHubInput } from "@dockpit/shared";
import { existsSync } from "fs";
import { cloneGhRepo, detectGitHubRemote } from "./github";

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

export function createProject(input: CreateProjectInput): Project {
  const db = getDb();

  // Validate directory exists
  if (!existsSync(input.directory)) {
    throw new ValidationError(`Directory does not exist: ${input.directory}`);
  }

  // Validate name uniqueness
  const existing = db
    .query("SELECT id FROM projects WHERE name = ?")
    .get(input.name);
  if (existing) {
    throw new ValidationError(`Project name already exists: ${input.name}`);
  }

  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO projects (id, name, directory) VALUES (?, ?, ?)`,
    [id, input.name, input.directory]
  );

  return getProject(id)!;
}

export async function createProjectFromGitHub(input: CreateProjectFromGitHubInput): Promise<Project> {
  const db = getDb();

  // Validate name uniqueness
  const existing = db
    .query("SELECT id FROM projects WHERE name = ?")
    .get(input.name);
  if (existing) {
    throw new ValidationError(`Project name already exists: ${input.name}`);
  }

  // Clone the repo
  const directory = await cloneGhRepo(input.repo, input.directory);

  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO projects (id, name, directory, github_repo) VALUES (?, ?, ?, ?)`,
    [id, input.name, directory, input.repo]
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

export function deleteProject(id: string): void {
  const db = getDb();
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
