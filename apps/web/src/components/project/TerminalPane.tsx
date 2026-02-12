import { XTerminal } from "../terminal/XTerminal";

interface Props {
  projectId: string;
  sessionId: string;
  isRunning: boolean;
}

export function TerminalPane({ projectId, sessionId, isRunning }: Props) {
  if (!isRunning) {
    return (
      <div className="h-full bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500 text-sm">Container not running</p>
          <p className="text-zinc-600 text-xs mt-1">
            Start the container to use the terminal
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-zinc-950 p-1 overflow-hidden">
      <XTerminal
        projectId={projectId}
        sessionId={sessionId}
        enabled={isRunning}
      />
    </div>
  );
}
