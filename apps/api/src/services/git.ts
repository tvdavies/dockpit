import type {
  GitStatusResponse,
  GitDiffResponse,
  GitLogEntry,
} from "@dockpit/shared";
import { $ } from "bun";

export async function getGitStatus(
  directory: string
): Promise<GitStatusResponse["data"]> {
  const branch = await $`git -C ${directory} branch --show-current`
    .text()
    .then((s) => s.trim())
    .catch(() => "unknown");

  const statusText = await $`git -C ${directory} status --porcelain`.text();
  const lines = statusText.split("\n").filter(Boolean);

  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    const x = line[0];
    const y = line[1];
    const file = line.slice(3);

    if (x !== " " && x !== "?") staged.push(file);
    if (y === "M" || y === "D") modified.push(file);
    if (x === "?" && y === "?") untracked.push(file);
  }

  let ahead = 0;
  let behind = 0;
  try {
    const abText =
      await $`git -C ${directory} rev-list --left-right --count HEAD...@{upstream}`.text();
    const parts = abText.trim().split(/\s+/);
    ahead = parseInt(parts[0], 10) || 0;
    behind = parseInt(parts[1], 10) || 0;
  } catch {
    // No upstream configured
  }

  return { branch, staged, modified, untracked, ahead, behind };
}

export async function getGitDiff(
  directory: string
): Promise<GitDiffResponse["data"]> {
  const diff = await $`git -C ${directory} diff`.text().catch(() => "");
  const stagedDiff = await $`git -C ${directory} diff --cached`
    .text()
    .catch(() => "");

  const fullDiff = [diff, stagedDiff].filter(Boolean).join("\n");

  // Parse diffstat
  const statText = await $`git -C ${directory} diff --numstat`.text().catch(() => "");
  const stagedStatText = await $`git -C ${directory} diff --cached --numstat`
    .text()
    .catch(() => "");

  const files: GitDiffResponse["data"]["files"] = [];
  const allStatLines = [statText, stagedStatText]
    .join("\n")
    .split("\n")
    .filter(Boolean);

  const seen = new Set<string>();
  for (const line of allStatLines) {
    const [add, del, path] = line.split("\t");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    files.push({
      path,
      status: "modified",
      additions: parseInt(add, 10) || 0,
      deletions: parseInt(del, 10) || 0,
    });
  }

  return { diff: fullDiff, files };
}

export async function getGitLog(
  directory: string,
  limit: number = 20
): Promise<GitLogEntry[]> {
  const format = "%H%n%h%n%an%n%aI%n%s%n---";
  const logText =
    await $`git -C ${directory} log --format=${format} -n ${limit}`
      .text()
      .catch(() => "");

  const entries: GitLogEntry[] = [];
  const blocks = logText.split("---\n").filter(Boolean);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 5) continue;
    entries.push({
      hash: lines[0],
      shortHash: lines[1],
      author: lines[2],
      date: lines[3],
      message: lines[4],
    });
  }

  return entries;
}
