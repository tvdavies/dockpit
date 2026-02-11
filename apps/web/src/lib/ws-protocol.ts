export function createTerminalWsUrl(projectId: string, sessionId: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/terminal/${projectId}/${sessionId}`;
}

export function createEventsWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/events`;
}

export function encodeTerminalInput(data: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  const frame = new Uint8Array(encoded.length + 1);
  frame[0] = 0x00;
  frame.set(encoded, 1);
  return frame.buffer;
}

export function decodeTerminalOutput(data: ArrayBuffer): string | null {
  const view = new Uint8Array(data);
  if (view.length === 0) return null;
  if (view[0] !== 0x00) return null;
  const decoder = new TextDecoder();
  return decoder.decode(view.subarray(1));
}
