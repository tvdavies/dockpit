import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { variant: "success" | "secondary" | "warning" | "destructive" | "outline"; label: string; dotColor: string }> = {
  running: { variant: "success", label: "Running", dotColor: "bg-emerald-400" },
  exited: { variant: "secondary", label: "Stopped", dotColor: "bg-zinc-500" },
  created: { variant: "warning", label: "Created", dotColor: "bg-yellow-400" },
  paused: { variant: "warning", label: "Paused", dotColor: "bg-yellow-400" },
  restarting: { variant: "warning", label: "Restarting", dotColor: "bg-yellow-400" },
  removing: { variant: "destructive", label: "Removing", dotColor: "bg-red-400" },
  dead: { variant: "destructive", label: "Dead", dotColor: "bg-red-400" },
  not_created: { variant: "outline", label: "Not created", dotColor: "bg-zinc-600" },
};

export function ContainerStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || {
    variant: "outline" as const,
    label: status,
    dotColor: "bg-zinc-600",
  };

  return (
    <Badge variant={config.variant} className="gap-1.5 border-0">
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      {config.label}
    </Badge>
  );
}
