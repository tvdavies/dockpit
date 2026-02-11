const statusConfig: Record<string, { color: string; label: string }> = {
  running: { color: "bg-emerald-400", label: "Running" },
  exited: { color: "bg-zinc-500", label: "Stopped" },
  created: { color: "bg-yellow-400", label: "Created" },
  paused: { color: "bg-yellow-400", label: "Paused" },
  restarting: { color: "bg-yellow-400", label: "Restarting" },
  removing: { color: "bg-red-400", label: "Removing" },
  dead: { color: "bg-red-400", label: "Dead" },
  not_created: { color: "bg-zinc-600", label: "Not created" },
};

export function ContainerStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || {
    color: "bg-zinc-600",
    label: status,
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
      <span className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {config.label}
    </span>
  );
}
