import "../apps/paseo/paseo-polyfills";
import { Http } from "@nativescript/core";
import { openSocket } from "../native/socket";
import { apiError, resetApiStatus, testHttpApiKey, type ApiKeyStatus, type ApiService } from "../ui/api-key-status";
import { PaseoDaemonClient } from "../apps/paseo/paseo-client";
import { createGlassesWebSocket } from "../apps/paseo/paseo-socket";
import * as adapters from "../apps/paseo/vendor/paseo-transport";
import { loadPairing } from "../apps/paseo/paseo-store";

export async function testApiKey(service: ApiService, key: string): Promise<{ status: ApiKeyStatus; detail?: string }> {
  if (service !== "soniox" && service !== "paseo") {
    return { status: await testHttpApiKey(service, key, async (url, options) => {
      const response = await Http.request({ url, method: options.method, headers: options.headers, content: options.body, timeout: 15000 });
      return { status: response.statusCode };
    }) };
  }
  const start = Date.now();
  if (service === "paseo" && !loadPairing() || service === "soniox" && !key.trim()) return { status: resetApiStatus(false) };
  try {
    const detail = service === "soniox" ? await testSoniox(key) : await testPaseo();
    return { status: { state: "ok", at: Date.now(), ms: Date.now() - start, error: null }, detail };
  } catch (error) {
    const code = Number((error as { code?: number })?.code);
    return { status: { state: "failed", at: Date.now(), ms: Date.now() - start, error: code ? apiError(code) : "Offline or connection timed out" } };
  }
}

function testSoniox(key: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let socket: ReturnType<typeof openSocket> | null = null;
    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const finish = (code?: number) => {
      if (settled) return;
      settled = true; clearTimeout(deadline); if (finishTimer) clearTimeout(finishTimer);
      socket?.close(1000, "test complete");
      if (code === 0) resolve("Session accepted"); else reject(Object.assign(new Error("Service test failed"), { code }));
    };
    const deadline = setTimeout(() => finish(), 15000);
    try {
      socket = openSocket("wss://stt-rt.soniox.com/transcribe-websocket", {
        onOpen() {
          socket?.sendText(JSON.stringify({ api_key: key, model: "stt-rt-v5", audio_format: "pcm_s16le", sample_rate: 16000, num_channels: 1 }));
          finishTimer = setTimeout(() => socket?.sendText(""), 1000);
        },
        onTextMessage(text) {
          let data: any;
          try { data = JSON.parse(text); } catch { finish(); return; }
          if (data.error_code) finish(Number(data.error_code));
          else if (data.finished) finish(0);
        },
        onClosed: () => finish(), onFailure: () => finish(),
      });
    } catch { finish(); }
  });
}

function testPaseo(): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new PaseoDaemonClient(loadPairing()!, { webSocketFactory: createGlassesWebSocket, adapters,
      clientId: `faceclaw-key-test-${Date.now()}`, appVersion: "1.0.0", log: () => {} });
    let fetching = false, settled = false;
    const finish = (detail?: string) => {
      if (settled) return;
      settled = true; clearTimeout(deadline); unsubscribe(); client.stop();
      if (detail) resolve(detail); else reject(new Error("Connection failed"));
    };
    const deadline = setTimeout(() => finish(), 20000);
    const unsubscribe = client.onChange(() => {
      if (!client.connected || fetching) return;
      fetching = true;
      void client.fetchAgents({ limit: 1000 }).then(page => finish(`Connected · ${page.entries.length}${page.pageInfo?.hasMore ? "+" : ""} agents · ${client.pairing.kind}`), () => finish());
    });
    client.start();
  });
}
