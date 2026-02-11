import { useEffect, useRef } from "react";
import { useTerminal } from "../../hooks/useTerminal";

interface Props {
  projectId: string;
  sessionId: string;
  enabled?: boolean;
}

export function XTerminal({ projectId, sessionId, enabled = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { attach } = useTerminal({ projectId, sessionId, enabled });

  useEffect(() => {
    if (!containerRef.current || !enabled) return;
    const cleanup = attach(containerRef.current);
    cleanupRef.current = cleanup ?? null;
    return () => {
      cleanup?.();
      cleanupRef.current = null;
    };
  }, [attach, enabled]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: 200 }}
    />
  );
}
