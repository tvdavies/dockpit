import { useState } from "react";
import type { TunnelPortStatus } from "@dockpit/shared";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, X, Power } from "lucide-react";

interface Props {
  apiConnected: boolean;
  agentConnected: boolean | null;
  tunnelPorts: TunnelPortStatus[];
  onDisconnectPort: (port: number) => void;
  onKillAgent: () => void;
}

export function ConnectionStatus({ apiConnected, agentConnected, tunnelPorts, onDisconnectPort, onKillAgent }: Props) {
  const [copied, setCopied] = useState(false);

  const listeningPorts = tunnelPorts.filter((p) => p.status === "listening");
  const pendingPorts = tunnelPorts.filter((p) => p.status === "pending");
  const errorPorts = tunnelPorts.filter((p) => p.status === "error");
  const installCmd = `curl -fsSL http://${window.location.host}/api/agent/install | bash`;

  const handleCopy = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = installCmd;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* copy failed */ }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 cursor-pointer">
          <StatusDot connected={apiConnected} label="API" />
          <StatusDot connected={agentConnected === true} label="Agent" />
          {listeningPorts.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
              {listeningPorts.length} tunnel{listeningPorts.length !== 1 && "s"}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        {/* Status section */}
        <div className="p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">API Server</span>
            <span className={apiConnected ? "text-emerald-400" : "text-zinc-500"}>
              {apiConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Tunnel Agent</span>
            <div className="flex items-center gap-2">
              <span className={agentConnected ? "text-emerald-400" : "text-zinc-500"}>
                {agentConnected ? "Connected" : "Not connected"}
              </span>
              {agentConnected && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-zinc-500 hover:text-red-400"
                  onClick={onKillAgent}
                >
                  <Power className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Agent not connected — show install command */}
        {agentConnected === false && (
          <>
            <div className="border-t border-zinc-700" />
            <div className="p-3 text-xs">
              <div className="text-zinc-400 mb-1.5">Install & start agent</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-zinc-900 hover:bg-zinc-700/50 rounded text-left font-mono text-zinc-300 h-auto justify-start"
              >
                <span className="flex-1 min-w-0 truncate text-xs">{installCmd}</span>
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                )}
              </Button>
            </div>
          </>
        )}

        {/* Active tunnels */}
        {listeningPorts.length > 0 && (
          <>
            <div className="border-t border-zinc-700" />
            <div className="p-3 text-xs">
              <div className="text-zinc-400 mb-2">Active Tunnels</div>
              <div className="flex flex-col gap-1">
                {listeningPorts.map((tp) => (
                  <div
                    key={tp.port}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-700/30 group"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="flex-1 text-zinc-300">
                      {tp.localPort === tp.port
                        ? `Port ${tp.port}`
                        : `Port ${tp.port} \u2192 ${tp.localPort}`}
                    </span>
                    <a
                      href={`http://localhost:${tp.localPort}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 font-mono shrink-0"
                    >
                      :{tp.localPort}
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 shrink-0"
                      onClick={() => onDisconnectPort(tp.port)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Pending tunnels */}
        {pendingPorts.length > 0 && (
          <>
            {listeningPorts.length === 0 && <div className="border-t border-zinc-700" />}
            <div className={listeningPorts.length > 0 ? "px-3 pb-3 text-xs" : "p-3 text-xs"}>
              {listeningPorts.length === 0 && <div className="text-zinc-400 mb-2">Tunnels</div>}
              <div className="flex flex-col gap-1">
                {pendingPorts.map((tp) => (
                  <div
                    key={tp.port}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-zinc-500"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 animate-pulse" />
                    <span className="flex-1">Port {tp.port}</span>
                    <span className="text-zinc-600">connecting...</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Error tunnels */}
        {errorPorts.length > 0 && (
          <div className="px-3 pb-3 text-xs">
            <div className="flex flex-col gap-1">
              {errorPorts.map((tp) => (
                <div
                  key={tp.port}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-red-400"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  <span className="flex-1">Port {tp.port}</span>
                  <span className="text-red-400/60">error</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No tunnels */}
        {agentConnected && tunnelPorts.length === 0 && (
          <>
            <div className="border-t border-zinc-700" />
            <div className="p-3 text-xs text-zinc-500">
              No active tunnels
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function StatusDot({ connected, label }: { connected: boolean; label: string }) {
  return (
    <Badge variant={connected ? "success" : "secondary"}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          connected ? "bg-emerald-400" : "bg-zinc-500"
        }`}
      />
      {label}
    </Badge>
  );
}
