import { useEffect, useRef, useState } from "react";

interface UseWebSocketOptions {
  url: string;
  binaryType?: BinaryType;
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnect?: boolean;
  reconnectInterval?: number;
}

export function useWebSocket({
  url,
  binaryType = "arraybuffer",
  onMessage,
  onOpen,
  onClose,
  reconnect = true,
  reconnectInterval = 3000,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  // Store callbacks in refs so the effect doesn't depend on them
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const ws = new WebSocket(url);
      ws.binaryType = binaryType;
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        onOpenRef.current?.();
      };

      ws.onmessage = (event) => {
        onMessageRef.current?.(event);
      };

      ws.onclose = () => {
        setConnected(false);
        onCloseRef.current?.();
        if (reconnect && mountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [url, binaryType, reconnect, reconnectInterval]);

  const send = (data: string | ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  };

  return { send, connected, ws: wsRef };
}
