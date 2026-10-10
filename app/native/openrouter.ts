import type { LlmContentBlock, LlmMessage, LlmStreamHandle, LlmStreamOptions } from "../assistant/llm-protocol";
import { openSseRequest } from "./sse";

export function openRouterMessages(messages: LlmMessage[]): object[] {
  const result: object[] = [];
  for (const message of messages) {
    if (typeof message.content === "string") { result.push(message); continue; }
    const text = message.content.filter((b): b is Extract<LlmContentBlock, { type: "text" }> => b.type === "text").map(b => b.text).join("");
    const calls = message.content.filter((b): b is Extract<LlmContentBlock, { type: "tool_use" }> => b.type === "tool_use").map(b => ({
      id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) },
    }));
    if (text || calls.length) result.push({ role: message.role, content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    for (const block of message.content) if (block.type === "tool_result") {
      result.push({ role: "tool", tool_call_id: block.tool_use_id, content: block.is_error ? `Error: ${block.content}` : block.content });
    }
  }
  return result;
}

export function streamOpenRouterResponse(options: LlmStreamOptions): LlmStreamHandle {
  let settled = false;
  let request: { cancel(): void } | null = null;
  let text = "";
  let reason: string | null = null;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  const fail = (message: string) => {
    if (settled) return;
    settled = true; request?.cancel(); options.onError(message);
  };
  const finish = () => {
    if (settled) return;
    if (!reason) { fail("OpenRouter stream ended before completion"); return; }
    const content: LlmContentBlock[] = text ? [{ type: "text", text }] : [];
    if (calls.size && reason !== "tool_calls") { fail("OpenRouter returned incomplete tool calls"); return; }
    try {
      for (const [, call] of [...calls].sort((a, b) => a[0] - b[0])) {
        if (!call.id || !call.name) throw new Error("incomplete tool");
        content.push({ type: "tool_use", id: call.id, name: call.name, input: JSON.parse(call.arguments || "{}") });
      }
    } catch { fail("OpenRouter returned invalid tool arguments"); return; }
    settled = true; request?.cancel();
    options.onDone({ text, content, stopReason: calls.size ? "tool_use" : reason === "stop" ? "end_turn" : reason });
  };
  const body = {
    model: options.model, stream: true, max_tokens: options.maxTokens ?? 1024,
    provider: { order: ["Cerebras"], allow_fallbacks: false },
    messages: [...(options.system ? [{ role: "system", content: options.system }] : []), ...openRouterMessages(options.messages)],
    ...(options.tools?.length ? { tools: options.tools.map(tool => ({ type: "function", function: {
      name: tool.name, description: tool.description, parameters: tool.input_schema,
    } })) } : {}),
  };
  try {
    request = openSseRequest("https://openrouter.ai/api/v1/chat/completions", JSON.stringify(body), {
      Authorization: `Bearer ${options.apiKey.trim()}`,
    }, {
      onLine: (line) => {
        if (settled || !line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (data === "[DONE]") { finish(); return; }
        if (!data) return;
        let event: any;
        try { event = JSON.parse(data); } catch { fail("OpenRouter returned an invalid stream"); return; }
        if (event.error) { fail("OpenRouter request failed"); return; }
        const choice = event.choices?.[0];
        if (!choice) return;
        if (choice.delta?.content) { text += choice.delta.content; options.onTextDelta?.(choice.delta.content, text); }
        for (const delta of choice.delta?.tool_calls ?? []) {
          const call = calls.get(delta.index) ?? { id: "", name: "", arguments: "" };
          call.id += delta.id ?? ""; call.name += delta.function?.name ?? ""; call.arguments += delta.function?.arguments ?? "";
          calls.set(delta.index, call);
        }
        if (choice.finish_reason) reason = choice.finish_reason;
      },
      onHttpError: (code) => fail(`OpenRouter: ${code === 401 ? "Invalid key" : code === 402 ? "No credit" : code === 429 ? "Rate limited" : "HTTP error"} (${code})`),
      onComplete: finish,
      onFailure: () => fail("OpenRouter connection failed"),
    });
  } catch { fail("OpenRouter connection failed"); }
  return { cancel() { settled = true; request?.cancel(); } };
}
