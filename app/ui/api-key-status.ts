export const API_SERVICES = ["paseo", "soniox", "openrouter", "parallel", "cerebras", "anthropic", "openai", "brave", "mapbox", "elevenlabs"] as const;
export type ApiService = typeof API_SERVICES[number];
export type ApiKeyStatus = { state: "ok" | "failed" | "missing" | "untested"; at: number; ms: number | null; error: string | null };
export const apiStatusKey = (service: ApiService): string => `apiKeys.status.${service}`;
export function resetApiStatus(present: boolean, now = Date.now()): ApiKeyStatus {
  return { state: present ? "untested" : "missing", at: now, ms: null, error: null };
}
export function apiError(code: number): string {
  return ({ 401: "Invalid key (401)", 403: "Permission denied (403)", 402: "No credit (402)", 429: "Rate limited (429)" } as Record<number, string>)[code] ?? `Service error (${code})`;
}
export function statusText(status: ApiKeyStatus): string {
  if (status.state === "missing") return "Not set";
  if (status.state === "untested") return "Untested";
  const date = new Date(status.at);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${status.state === "ok" ? "OK" : status.error ?? "Failed"} · ${status.ms ?? 0} ms · ${time}`;
}
type Fetch = (url: string, options: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number }>;
export async function testHttpApiKey(service: Exclude<ApiService, "paseo" | "soniox">, key: string, fetcher: Fetch, now = Date.now): Promise<ApiKeyStatus> {
  key = key.trim();
  if (!key) return resetApiStatus(false, now());
  const start = now();
  let url = "", method = "GET", body: string | undefined;
  let headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  switch (service) {
    case "openrouter": url = "https://openrouter.ai/api/v1/auth/key"; break;
    case "openai": url = "https://api.openai.com/v1/models"; break;
    case "cerebras": url = "https://api.cerebras.ai/v1/models"; break;
    case "anthropic": url = "https://api.anthropic.com/v1/models?limit=1"; headers = { "x-api-key": key, "anthropic-version": "2023-06-01" }; break;
    case "parallel":
      url = "https://api.parallel.ai/v1/search"; method = "POST";
      headers = { "x-api-key": key, "Content-Type": "application/json" };
      body = JSON.stringify({ mode: "fast", search_queries: ["Even Realities smart glasses"], advanced_settings: { max_results: 1 } }); break;
    case "brave": url = "https://api.search.brave.com/res/v1/web/search?q=Even%20Realities&count=1"; headers = { "X-Subscription-Token": key }; break;
    case "mapbox": url = `https://api.mapbox.com/search/geocode/v6/forward?q=Quito&limit=1&access_token=${encodeURIComponent(key)}`; headers = {}; break;
    case "elevenlabs": url = "https://api.elevenlabs.io/v1/user"; headers = { "xi-api-key": key }; break;
  }
  try {
    const response = await fetcher(url, { method, headers, ...(body ? { body } : {}) });
    const ok = response.status >= 200 && response.status < 300;
    return { state: ok ? "ok" : "failed", at: now(), ms: Math.max(0, now() - start), error: ok ? null : apiError(response.status) };
  } catch {
    return { state: "failed", at: now(), ms: Math.max(0, now() - start), error: "Offline or connection timed out" };
  }
}
