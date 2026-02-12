import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface Props {
  agentConnected: boolean | null;
}

export function AgentWarning({ agentConnected }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || agentConnected !== false) return null;

  const host = window.location.host;
  const installCmd = `curl -fsSL http://${host}/api/agent/install | bash`;

  return (
    <Alert variant="warning" className="rounded-none border-x-0 border-t-0 flex items-center gap-3 py-2 text-xs">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <AlertDescription className="flex-1">
        Tunnel agent not connected. Install and run:{" "}
        <code className="px-1.5 py-0.5 bg-zinc-800 rounded text-amber-200 select-all">
          {installCmd}
        </code>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setDismissed(true)}
        className="h-6 w-6 shrink-0 text-amber-400 hover:text-amber-200"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </Alert>
  );
}
