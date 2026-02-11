import { useRef, useCallback, useEffect } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import {
  createTerminalWsUrl,
  encodeTerminalInput,
  decodeTerminalOutput,
} from "../lib/ws-protocol";

interface UseTerminalOptions {
  projectId: string;
  sessionId: string;
  enabled?: boolean;
}

export function useTerminal({ projectId, sessionId, enabled = true }: UseTerminalOptions) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const attach = useCallback(
    (container: HTMLDivElement | null) => {
      if (!container || !enabled) return;
      containerRef.current = container;

      // Create terminal
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        theme: {
          background: "#09090b",
          foreground: "#fafafa",
          cursor: "#fafafa",
          selectionBackground: "#3f3f46",
          black: "#09090b",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#fafafa",
          brightBlack: "#52525b",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#facc15",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#ffffff",
        },
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);

      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch {
        // WebGL not available, canvas renderer is fine
      }

      // Defer fit until DOM has laid out
      requestAnimationFrame(() => {
        try { fit.fit(); } catch {}
      });
      termRef.current = term;
      fitRef.current = fit;

      // Connect WebSocket
      const ws = new WebSocket(createTerminalWsUrl(projectId, sessionId));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        // Send initial resize
        ws.send(
          JSON.stringify({
            type: "terminal:resize",
            sessionId,
            cols: term.cols,
            rows: term.rows,
          })
        );
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const text = decodeTerminalOutput(event.data);
          if (text) term.write(text);
        } else if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "terminal:ready") {
              // Session established
            }
          } catch {
            // Ignore
          }
        }
      };

      ws.onclose = () => {
        term.write("\r\n\x1b[90m[Connection closed]\x1b[0m\r\n");
      };

      // Terminal input -> WebSocket
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encodeTerminalInput(data));
        }
      });

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "terminal:resize",
              sessionId,
              cols: term.cols,
              rows: term.rows,
            })
          );
        }
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        ws.close();
        term.dispose();
      };
    },
    [projectId, sessionId, enabled]
  );

  return { attach, terminal: termRef, fit: fitRef };
}
