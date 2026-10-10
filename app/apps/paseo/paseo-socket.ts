import { openSocket } from "../../native/socket";
import type { WebSocketLike } from "./vendor/paseo-transport";
export function createGlassesWebSocket(url: string): WebSocketLike {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const emit = (type: string, event: unknown) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
  };
  const ws: WebSocketLike = {
    readyState: 0,
    binaryType: "arraybuffer",
    addEventListener: (type, listener) => {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(listener);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    send: (data) => {
      if (typeof data !== "string") throw new Error("Binary frames are not supported on the glasses socket.");
      socket.sendText(data);
    },
    close: (code, reason) => {
      if (ws.readyState >= 2) return;
      ws.readyState = 2;
      socket.close(code ?? 1000, reason ?? "");
    },
  };
  const socket = openSocket(url, {
    onOpen: () => {
      ws.readyState = 1;
      emit("open", {});
    },
    onTextMessage: (text) => emit("message", { data: text }),
    onClosed: (code, reason) => {
      ws.readyState = 3;
      emit("close", { code, reason });
    },
    onFailure: (message) => {
      // OkHttp reports a failure instead of a close; the transport expects both.
      ws.readyState = 3;
      emit("error", { message: describeSocketFailure(message) });
      emit("close", { code: 1006, reason: describeSocketFailure(message) });
    },
  });
  return ws;
}

function describeSocketFailure(message: string): string {
  const text = String(message).replace(/^[\w.]*(Exception|Error):\s*/, "");
  if (/Failed to connect|ECONNREFUSED|Connection refused|Unable to resolve host/i.test(text)) return "Can't reach the relay.";
  if (/timeout/i.test(text)) return "Connection timed out.";
  return text || "Connection failed.";
}
