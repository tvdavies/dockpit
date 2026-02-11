import { homedir } from "os";
import { join, basename } from "path";
import { existsSync } from "fs";
import type { GitHubRepo, GitHubAuthStatusResponse } from "@dockpit/shared";

const GH = "/usr/bin/gh";

async function exec(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export async function getGhAuthStatus(): Promise<GitHubAuthStatusResponse> {
  const { stdout, stderr, exitCode } = await exec([GH, "auth", "status"]);
  if (exitCode !== 0) {
    return { authenticated: false, username: null };
  }
  const output = stdout || stderr; // gh writes status info to stderr
  const match = output.match(/Logged in to github\.com.*?account\s+(\S+)/i)
    ?? output.match(/account\s+(\S+)/i)
    ?? output.match(/Logged in to github\.com as (\S+)/i);
  return {
    authenticated: true,
    username: match?.[1] ?? null,
  };
}

export async function listGhRepos(opts?: { query?: string; limit?: number }): Promise<{ repos: GitHubRepo[]; hasMore: boolean }> {
  const limit = opts?.limit ?? 30;
  const perPage = Math.min(limit + 1, 100);

  // Use GitHub API via gh to get all repos (personal + org)
  const endpoint = `/user/repos?sort=updated&per_page=${perPage}&affiliation=owner,collaborator,organization_member`;
  const { stdout, exitCode, stderr } = await exec([GH, "api", endpoint]);
  if (exitCode !== 0) {
    throw new Error(`gh failed: ${stderr}`);
  }

  let raw: any[] = JSON.parse(stdout || "[]");

  // Client-side filter when searching
  if (opts?.query) {
    const q = opts.query.toLowerCase();
    raw = raw.filter((r: any) =>
      r.full_name?.toLowerCase().includes(q) ||
      r.name?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q)
    );
  }

  const hasMore = raw.length > limit;
  const items = raw.slice(0, limit);

  const repos: GitHubRepo[] = items.map((r: any) => ({
    fullName: r.full_name,
    name: r.name,
    owner: r.owner?.login ?? "",
    description: r.description || null,
    isPrivate: r.private ?? false,
    defaultBranch: r.default_branch ?? "main",
    language: r.language ?? null,
    url: r.html_url ?? "",
  }));

  return { repos, hasMore };
}

function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

export async function cloneGhRepo(repo: string, targetDir?: string): Promise<string> {
  // Default to ~/dev/<owner>/<name>, expand ~ to absolute path
  const dir = targetDir ? expandHome(targetDir) : join(homedir(), "dev", repo);

  // Skip clone if directory already exists (already cloned)
  if (existsSync(dir)) {
    return dir;
  }

  const { exitCode, stderr } = await exec([GH, "repo", "clone", repo, dir]);
  if (exitCode !== 0) {
    throw new Error(`Clone failed: ${stderr}`);
  }

  return dir;
}

export async function detectGitHubRemote(dir: string): Promise<string | null> {
  const { stdout, exitCode } = await exec(["git", "-C", dir, "remote", "get-url", "origin"]);
  if (exitCode !== 0) return null;

  // Parse owner/repo from various URL formats
  const url = stdout;
  const sshMatch = url.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/);
  const httpsMatch = url.match(/github\.com\/(.+?\/.+?)(?:\.git)?$/);
  return sshMatch?.[1] ?? httpsMatch?.[1] ?? null;
}
