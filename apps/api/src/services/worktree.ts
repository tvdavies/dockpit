import { homedir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";

const WORKTREE_BASE = join(homedir(), ".dockpit", "worktrees");

export function getWorktreePath(projectName: string): string {
  return join(WORKTREE_BASE, projectName);
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
  projectName: string,
  branch: string
): Promise<string> {
  mkdirSync(WORKTREE_BASE, { recursive: true });
  const wtPath = getWorktreePath(projectName);

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
