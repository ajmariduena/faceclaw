# PHONE — lean implementation handoff

10 Oct 2026. Worktree `faceclaw-lean-phone`, branch `lean/phone`.
Production code verified at `dee79adc7dfbc2ee6d60289c42643d037afaa646`.

## Delivered

- Native phone page `phone-ui/api-keys-page`: masked fields, grouped services, individual Test / Test connection, Test all, collapsed Advanced, safe errors and elapsed time. Accessible from the phone action bar and the dashboard API keys section.
- Every changed key invalidates `apiKeys.status.<service>`. Stale in-flight tests cannot stamp a result on an edited key. Soniox waits for server completion (WebSocket open alone is not success); Paseo connects with the existing encrypted client, reads agents, then disconnects its own test client. HTTP tests use fixed requests; no microphone, user prompts, response bodies or keys enter logs/status JSON.
- Customization, Voice, Assistant and Watch sections live under Developer. Existing values survive. New defaults: Soniox speech and the OpenRouter model.
- `openrouter` provider streams OpenAI chat completions with fragmented tool calls, cancellation, checked tool JSON and premature-EOF handling. Model `openai/gpt-oss-120b`, provider `{order:["Cerebras"],allow_fallbacks:false}`. Existing OpenAI/Anthropic and saved conversation model IDs remain usable. The system prompt requests 1–2 short display-sized lines.
- Shared production painter `app/graphics/terminal-painter.ts`; `paseo-painter.ts` reexports it for compatibility. AI Chat uses the stock font, right-aligned user text, newest-message separator, quiet tool actions, Listening/Thinking/model footer, tap dictation and double-tap return. `timer.set` stays in AI Chat instead of opening Timers.
- Both chats hold dictated text in Send / Edit / Discard review. Edit uses the phone text-setting editor. Double tap cancels capture or closes the draft before navigating. Late final transcripts and late daemon startup cannot send. Paseo preserves the draft on disconnected/failed Send.

## Integration contracts for CORE

1. After opening/focusing AI Chat for Hey Even, call `startAiChatDictation(): boolean` exported from `app/apps/ai-chat/ai-chat-app.ts`. It does not launch the app itself. It returns false if the window is absent, a capture/review/turn is active, or no assistant is available. Check microphone ownership in the shell before calling it.
2. Both chat painters require the terminal viewport **576×288**. CORE's hidden header/sidebar/status bar must leave that whole band available.
3. Shell changes on this branch are only the `openRouterApiKeySetting` import and `openrouter: openRouterApiKeySetting.get()` in `resolveAssistantConfiguration`; preserve these when merging CORE's shell work.
4. New settings exported by `app/ui/dashboard-settings.ts`:
   - `openRouterApiKeySetting` → `llm.openRouterApiKey`
   - `parallelApiKeySetting` → `search.parallelApiKey`
   - `cerebrasApiKeySetting` → `llm.cerebrasApiKey`
   - `braveApiKeySetting` → `search.braveApiKey`
5. Status storage remains the agreed JSON `{state,at,ms,error}` under `apiKeys.status.<service>`. `app/ui/api-key-status.ts` exports the types and storage-key/status helpers.
6. Paseo worker home-status strings now use English. `all-apps.ts`, home, Calendar, Translate, More and glasses Settings were not changed.

## Verification

Final Crabbox run `run_c9fa423b86ce21f4b607b39712646aa7`, static id `faceclaw-lean-phone`:

- `npm test`: 823 total, 821 passed, 2 skipped, 0 failed.
- `npm run lint`: 0 warnings, 0 errors.
- `npm run build -- --no-hmr`: APK built successfully.
- Mini APK: `/Users/ajmariduena/crabbox/faceclaw-lean-phone/faceclaw/platforms/android/app/build/outputs/apk/debug/app-debug.apk`.
- Local log: `/tmp/faceclaw-lean-phone-verified-gates.log`.
- Local `tsc --noEmit`, focused service/provider/draft tests and `git diff --check` passed.
- `node --test lean-chats.test.cjs paseo-app.test.cjs` from `tools/headless-render`: 5 passed. Production painter, actual stock font, horizontal/vertical bounds, glyph coverage, alignment, quiet tool actions and draft choices checked. All generated PNGs inspected. New screenshots: `out/lean-ai-{ready,answer,listening,thinking,draft}.png`, `out/lean-paseo-{draft,edit}.png`. Pair/list fixture copy updated to remove gesture hints.

No device/ADB, push, upstream writes, real credential calls or physical-lens acceptance were performed. Coordinator still owns merged-app/device validation, real API-key tests, wakeword routing and ring interactions. The pre-existing untracked `tools/headless-render/node_modules` symlink is deliberately excluded from commits; no extracted fonts/icons were committed.

## API references checked

- OpenRouter documentation via Context7 `/openrouterteam/docs`: chat completions, streaming/tool deltas, provider order and disabled fallbacks.
- Parallel documentation via Context7 `/websites/parallel_ai`: `/v1/search`, `x-api-key`, `fast`, fixed `search_queries`.
- Soniox documentation via Context7 `/websites/soniox`: `stt-rt-v5`, config-message authentication, empty-string end-of-audio and server `finished`/error responses.
