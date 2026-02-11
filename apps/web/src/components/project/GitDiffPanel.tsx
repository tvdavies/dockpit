import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { GitDiffResponse, GitStatusResponse } from "@dockpit/shared";

interface Props {
  projectId: string;
}

export function GitDiffPanel({ projectId }: Props) {
  const [status, setStatus] = useState<GitStatusResponse["data"] | null>(null);
  const [diff, setDiff] = useState<GitDiffResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, d] = await Promise.all([
        api.git.status(projectId),
        api.git.diff(projectId),
      ]);
      setStatus(s);
      setDiff(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [projectId]);

  if (loading && !status) {
    return (
      <div className="h-full bg-zinc-950 flex items-center justify-center">
        <span className="text-zinc-500 text-sm">Loading git info...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full bg-zinc-950 flex items-center justify-center">
        <span className="text-red-400 text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="h-full bg-zinc-950 flex">
      {/* File list sidebar */}
      <div className="w-56 border-r border-zinc-800 overflow-y-auto flex-shrink-0">
        <div className="px-3 py-2 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">
              {status?.branch || "unknown"}
            </span>
            <button
              onClick={fetchData}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
            >
              Refresh
            </button>
          </div>
          {status && (
            <div className="flex gap-3 mt-1 text-xs text-zinc-500">
              {status.modified.length > 0 && (
                <span className="text-yellow-400">
                  {status.modified.length} modified
                </span>
              )}
              {status.untracked.length > 0 && (
                <span className="text-emerald-400">
                  {status.untracked.length} new
                </span>
              )}
              {status.staged.length > 0 && (
                <span className="text-blue-400">
                  {status.staged.length} staged
                </span>
              )}
            </div>
          )}
        </div>
        <div className="py-1">
          {diff?.files.map((file) => (
            <button
              key={file.path}
              onClick={() => setSelectedFile(file.path)}
              className={`w-full px-3 py-1 text-left text-xs truncate cursor-pointer transition-colors ${
                selectedFile === file.path
                  ? "bg-zinc-800 text-zinc-200"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300"
              }`}
            >
              <span className="font-mono">{file.path}</span>
              <span className="ml-2 text-zinc-600">
                <span className="text-emerald-500">+{file.additions}</span>{" "}
                <span className="text-red-500">-{file.deletions}</span>
              </span>
            </button>
          ))}
          {diff?.files.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-zinc-600">
              No changes
            </div>
          )}
        </div>
      </div>

      {/* Diff view */}
      <div className="flex-1 overflow-auto">
        {diff?.diff ? (
          <pre className="p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap">
            {diff.diff.split("\n").map((line, i) => {
              let color = "text-zinc-400";
              if (line.startsWith("+") && !line.startsWith("+++"))
                color = "text-emerald-400 bg-emerald-500/5";
              else if (line.startsWith("-") && !line.startsWith("---"))
                color = "text-red-400 bg-red-500/5";
              else if (line.startsWith("@@")) color = "text-blue-400";
              else if (line.startsWith("diff ")) color = "text-zinc-500 font-semibold";

              return (
                <div key={i} className={`${color} px-2`}>
                  {line}
                </div>
              );
            })}
          </pre>
        ) : (
          <div className="h-full flex items-center justify-center">
            <span className="text-zinc-600 text-sm">
              {selectedFile
                ? "Select a file to view diff"
                : "No diff available"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
