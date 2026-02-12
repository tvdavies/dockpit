import { homedir } from "os";
import { join } from "path";
import { mkdirSync, rmSync, existsSync, copyFileSync, readdirSync } from "fs";

const WORKTREE_BASE = join(homedir(), ".dockpit", "worktrees");

export function getWorktreePath(workspaceId: string): string {
  return join(WORKTREE_BASE, workspaceId);
}

async function exec(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export async function createWorktree(
  sourceRepo: string,
  workspaceId: string,
  branch: string
): Promise<string> {
  mkdirSync(WORKTREE_BASE, { recursive: true });
  const wtPath = getWorktreePath(workspaceId);

  // Clean up stale worktree directory from a previously deleted project
  if (existsSync(wtPath)) {
    // Prune stale worktree entries in git first
    await exec(["git", "-C", sourceRepo, "worktree", "prune"]);
    // Remove the leftover directory if it still exists
    if (existsSync(wtPath)) {
      rmSync(wtPath, { recursive: true, force: true });
    }
  }

  // Try creating with a new branch first
  const { exitCode, stderr } = await exec([
    "git", "-C", sourceRepo, "worktree", "add", "-b", branch, wtPath,
  ]);

  if (exitCode !== 0) {
    // Branch may already exist — try adding worktree for existing branch
    if (stderr.includes("already exists")) {
      const fallback = await exec([
        "git", "-C", sourceRepo, "worktree", "add", wtPath, branch,
      ]);
      if (fallback.exitCode !== 0) {
        throw new Error(`Failed to create worktree: ${fallback.stderr}`);
      }
    } else {
      throw new Error(`Failed to create worktree: ${stderr}`);
    }
  }

  // Copy .env* files from source repo (they're gitignored so worktree won't have them)
  try {
    for (const entry of readdirSync(sourceRepo)) {
      if (entry.startsWith(".env")) {
        copyFileSync(join(sourceRepo, entry), join(wtPath, entry));
      }
    }
  } catch {}

  return wtPath;
}

export async function removeWorktree(
  sourceRepo: string,
  worktreePath: string
): Promise<void> {
  // Best-effort removal
  await exec([
    "git", "-C", sourceRepo, "worktree", "remove", worktreePath, "--force",
  ]);
}
