/** Types for the vendored subset of @getpaseo/client (see scripts/refresh-paseo-vendor.sh). */
export interface DaemonTransport {
  send: (data: string | Uint8Array | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: (handler: (data: unknown, isBinary: boolean) => void) => () => void;
  onOpen: (handler: () => void) => () => void;
  onClose: (handler: (event?: unknown) => void) => () => void;
  onError: (handler: (event?: unknown) => void) => () => void;
}
export type DaemonTransportFactory = (options: { url: string; headers?: Record<string, string>; protocols?: string[] }) => DaemonTransport;
export interface WebSocketLike {
  readyState: number;
  send: (data: string | Uint8Array | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
  binaryType?: string;
  addEventListener?: (event: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (event: string, listener: (event: unknown) => void) => void;
}
export type WebSocketFactory = (url: string, options?: { headers?: Record<string, string>; protocols?: string[] }) => WebSocketLike;
export interface TransportLogger {
  warn(obj: object, msg?: string): void;
}
export function createWebSocketTransportFactory(factory: WebSocketFactory): DaemonTransportFactory;
export function createEncryptedTransport(base: DaemonTransport, daemonPublicKeyB64: string, logger: TransportLogger): DaemonTransport;
