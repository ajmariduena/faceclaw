# Instant: proveedores más rápidos (11 oct 2026)

Investigado hoy. Marcas: **[V]** = página del proveedor, **[B]** = benchmark independiente (Artificial Analysis, OpenRouter, Pipecat, Cekura, Openbenchmarks), **[M]** = medido hoy desde la Mac, **[?]** = sin confirmar (blog, marketing o cifra sin método).

Sobre las mediciones [M]: corrieron por OpenRouter con el proveedor fijado (`allow_fallbacks: false`) y la conexión reutilizada, de 5 a 6 llamadas por modelo, con un prompt corto en español. La TTFT cuenta hasta el primer token de **contenido**, así que incluye el razonamiento. La "llamada a herramienta" mide hasta el primer delta de `tool_calls`, con `web_search` y `set_timer` declaradas. Los scripts están en `/tmp/ic-probe/`.

## A. LLM: latencia y velocidad

Columnas:
- **AA**: artificialanalysis.ai. "TTFT" es la mediana del primer chunk y "t/s" la velocidad de salida.
- **OR p50**: la tabla de proveedores de OpenRouter, en p50 de la última semana.
- **[M]**: lo medido hoy.

| Proveedor · modelo (id directo) | AA TTFT / t/s [B] | OR p50 latencia / t/s [B] | [M] TTFT texto · herramienta | Precio in/out por M | Tools | OpenRouter id · slug | Fuente |
|---|---|---|---|---|---|---|---|
| **Cerebras · `gpt-oss-120b`** (effort low) | 0,42 s / 1.856 | 0,22 s / 746 (1 sem: 705) | **228 ms** (196–734) · **239 ms** | $0,35 / $0,75 [V] | sí | `openai/gpt-oss-120b` · `cerebras` | [AA](https://artificialanalysis.ai/models/gpt-oss-120b/providers), [OR](https://openrouter.ai/openai/gpt-oss-120b/providers), [V](https://inference-docs.cerebras.ai/models/openai-oss) |
| **Cerebras · `qwen-3.8-27b`** (`reasoning_effort: none`) | sin datos (AA no mide Cerebras para este modelo) | 0,18 s / 607 | **190 ms** (178–276) · 302 ms | $0,99 / $1,49 [V] | sí | `qwen/qwen3.8-27b` · `cerebras` | [OR](https://openrouter.ai/qwen/qwen3.8-27b/providers), [V](https://inference-docs.cerebras.ai/models/qwen-3.8-27b) |
| **Groq · `openai/gpt-oss-120b`** | 0,66 s / 471 | 0,17 s / 325 | **201 ms** (183–223) · 267 ms | $0,15 / $0,60 [V] | sí | `openai/gpt-oss-120b` · `groq` | [AA](https://artificialanalysis.ai/leaderboards/providers), [V](https://console.groq.com/docs/models) |
| **Groq · `llama-3.1-8b-instant`** | 0,78 s / 681 | 0,14 s / 349 | **162 ms** (161–170) · **223 ms** | $0,05 / $0,08 en OR; en GroqCloud directo sale "Enterprise / Contact sales" [V] | sí | `meta-llama/llama-3.1-8b-instruct` · `groq` | [AA](https://artificialanalysis.ai/models/llama-3-1-instruct-8b/providers), [OR](https://openrouter.ai/meta-llama/llama-3.1-8b-instruct/providers) |
| Groq · `openai/gpt-oss-20b` | 0,75 s / 909 | 0,47 s / 492, **uptime 53,8 %** | 306 ms | $0,075 / $0,30 [V] | sí | `openai/gpt-oss-20b` · `groq` | [OR](https://openrouter.ai/openai/gpt-oss-20b/providers) |
| Groq · `qwen/qwen3.8-27b` (preview) | — | Groq no aparece en OR | — | $0,80 / $4,00 [V] | sí | — | [V](https://console.groq.com/docs/models) |
| SambaNova · `gpt-oss-120b` | 1,18 s / 738 | 0,60 s / 264 | 434 ms (382–2.206) | $0,14 / $0,95 (OR) | sí | `openai/gpt-oss-120b` · `sambanova` | [AA](https://artificialanalysis.ai/models/gpt-oss-120b/providers), [V modelos](https://docs.sambanova.ai/docs/en/models/sambacloud-models) |
| Inception · `mercury-2.5` (diffusion) | 3,07–3,31 s / 673 (effort por defecto, medium) | 1,10–1,56 s / 268, **uptime 86–90 %** | `none`: **362 ms** · `low`: 699 ms · tool 524 ms | $0,20 / $0,75 de lista; hoy $0,04 / $0,15 (80 % off) [V] | sí | `inception/mercury-2.5` · `inception` | [AA](https://artificialanalysis.ai/models/mercury-2-5/providers), [OR](https://openrouter.ai/inception/mercury-2.5/providers), [V](https://docs.inceptionlabs.ai/get-started/models) |
| Inception · Mercury Voice | "TTFT < 170 ms" [?] (afirmación del proveedor) | no está en OR | — | $0,20 / $0,75 | sí | solo enterprise (por ventas) | [V](https://www.inceptionlabs.ai/blog/introducing-mercury-2-5) |
| Baseten · `gpt-oss-120b` | **0,20 s** / 238 | 0,20–0,24 s / 218–242 | 328 ms (272–863) | $0,10 / $0,50 | sí | `openai/gpt-oss-120b` · `baseten` | [AA](https://artificialanalysis.ai/leaderboards/providers) |
| Together · `gpt-oss-120b` | 0,43 s / 104 | 0,21 s / 174, uptime 92 % | 585 ms (falló en 2 de 5) | $0,15 / $0,60 | sí | `openai/gpt-oss-120b` · `together` | [OR](https://openrouter.ai/openai/gpt-oss-120b/providers) |
| Mistral · Small 4 `mistral-small-2603` | 0,72 s / 151 (sin razonamiento) | 0,37–0,39 s / 122 | 464 ms (escribió «Camberra») | $0,15 / $0,60 | sí | `mistralai/mistral-small-2603` · `mistral` | [AA](https://artificialanalysis.ai/models/mistral-small-4-non-reasoning/providers), [OR](https://openrouter.ai/mistralai/mistral-small-2603/providers) |
| Mistral · `ministral-8b-2512` | 0,72 s / 101 | 0,28–0,34 s / 83 | — | $0,15 / $0,15 | sí | `mistralai/ministral-8b-2512` · `mistral` | [OR](https://openrouter.ai/mistralai/ministral-8b-2512/providers) |
| Google · `gemini-3.5-flash-lite` | 8,17 s (razonamiento por defecto) / 365 | AI Studio 0,87 s / 156 | `minimal`: 609 ms. **No se puede apagar el razonamiento** (error 400) | $0,30 / $2,50 | sí | `google/gemini-3.5-flash-lite` · `google-ai-studio` | [AA](https://artificialanalysis.ai/models/gemini-3-5-flash-lite/providers), [OR](https://openrouter.ai/google/gemini-3.5-flash-lite/providers) |
| Google · `gemini-3.1-flash-lite` | — | 0,69 s / 142; prioridad 0,46 s / 201 | `none`: 636 ms; con prioridad 709 ms | $0,25 / $1,50 (prioridad: $0,45 / $2,70) | sí | `google/gemini-3.1-flash-lite` · `google-ai-studio` (`google-ai-studio/priority`) | [OR](https://openrouter.ai/google/gemini-3.1-flash-lite/providers) |
| OpenAI · GPT-6 Luna (su modelo rápido) | 0,79 s / 118 (sin razonamiento) | 2,53 s mezclado; Fast 1,60 s / 134 | `none`: 918 ms; con Fast 736 ms | $0,10 / $0,50; Fast $0,20 / $1,00 | sí | `openai/gpt-6-luna` · `openai` (`openai/fast`) | [AA](https://artificialanalysis.ai/models/gpt-6-luna-non-reasoning/providers), [V Fast mode](https://openai.com/api-priority-processing/) |
| xAI · `grok-4.3` (el "fast" del catálogo) | — | 1,26–1,43 s / 95; prioridad 0,54 s | `none`: 718 ms; con prioridad 625 ms | $1,25 / $2,50 (prioridad ×2) | sí | `x-ai/grok-4.3` · `xai` (`xai/priority`) | [OR](https://openrouter.ai/x-ai/grok-4.3/providers), [V](https://docs.x.ai/developers/models/grok-4.3) |
| Fireworks · Nemotron 3.5 Lightning | 0,50 s / 379 | — | — | — | — | — | [AA](https://artificialanalysis.ai/leaderboards/providers) |
| LithosAI · GLM-5.3-Flash "ULTRA CHAT" | 0,43 s / 1.007 (Intelligence Index 42, mucho más listo) | no aparece entre los proveedores de OR | — | — | — | — | [AA](https://artificialanalysis.ai/leaderboards/providers) |

Notas:
- **Cerebras sirve hoy al público solo dos modelos**, `gpt-oss-120b` (~3000 t/s) y `qwen-3.8-27b` (~1850 t/s). El resto va por Dedicated. Confirmado en [V](https://inference-docs.cerebras.ai/models/overview).
- **Groq Compound** (`groq/compound` y `-mini`) se apagó el **21/09/2026** sin reemplazo. Confirmado en [V](https://console.groq.com/docs/deprecations).
- En el catálogo de Groq quedan en producción: gpt-oss-120b, gpt-oss-20b, llama-3.1-8b-instant y llama-3.3-70b-versatile (las dos Llama como Enterprise), más whisper. En preview están qwen3.8-27b, minimax-m2.7 y los guard.
- **Fast mode** de OpenAI es el nombre que desde el 30/07/2026 lleva Priority processing (`service_tier: priority` o `fast`), según [V](https://openai.com/zh-Hans-CN/api-fast-mode/). Aun así, Luna con Fast mode no baja de ~0,7 s.
- La columna "Latency" de OpenRouter es el tiempo al primer token. La E2E se reporta aparte (Cerebras 0,76 s, Groq 1,06 s en gpt-oss-120b).
- **Sobrecosto de OpenRouter:**
  - Su doc de latencia ya no da cifra, solo "minimal" ([V](https://openrouter.ai/docs/features/latency-and-performance)). La portada decía antes "~25 ms" [?].
  - TrueFoundry midió con pares directo/OR: **~20 ms (dentro del ruido)** en un modelo con formato OpenAI (GPT-4o mini), y **+120 ms (BYOK) a +200 ms (créditos)** en Claude, por la traducción de formato ([B, pero de un competidor](https://www.truefoundry.com/blog/openrouter-latency-on-anthropic-why-bringing-your-own-key-is-faster)).
  - Cerebras y Groq usan formato OpenAI, así que el caso esperable es el de ~20 ms. Es una inferencia.
  - OpenRouter avisa que la latencia sube cuando el saldo baja a un solo dígito de dólares, y que los cachés de su edge tardan 1–2 min en calentarse.
  - Para ayudar al ruteo: `provider.sort: "latency"`, `preferred_max_latency: {p90: …}` y un `session_id` estable que fija el proveedor 10 min para conservar la caché.

## B. Speech-to-text en streaming: del fin del habla al texto final

Ojo con la definición. **Los tres benchmarks independientes miden la finalización forzada después de un VAD externo** (Silero), no el endpoint automático del proveedor. Es decir, miden el tiempo desde que el cliente dice "terminó" hasta que llega el texto final:
- **Pipecat TTFS** cuenta desde el fin real del habla, con el `stop_secs` del VAD incluido.
- **Cekura TTFS** cuenta desde que el que llama deja de hablar, con el contrato de finalización de cada proveedor.
- **AA (junio)** cuenta desde el fin de habla detectado por Silero.

| Proveedor · modelo | Pipecat TTFS p50 / p95 [B] | Cekura TTFS p50 / p95 [B] | AA final / parcial (jun) [B] | Endpoint automático propio [V] | Parciales tempranos | ES+EN mezclado | Fuente |
|---|---|---|---|---|---|---|---|
| **Soniox `stt-rt-v5`** (`stt-rt-v4` es alias desde jun) | **260 / 305 ms** (p99 313) | **38 / 79 ms**, el más rápido | 0,06 s / 0,05 s | semántico, con `<end>`. `max_endpoint_delay_ms` va de 500 a 3000 (por defecto 2000) y `endpoint_latency_adjustment_level` de 0 a 3. Hay `finalize` manual (`<fin>`), que pide ~200 ms de silencio antes | sí: tokens no finales continuos | sí, 60+ idiomas en un solo stream, con `language_hints` | [Pipecat](https://github.com/pipecat-ai/stt-benchmark), [Cekura](https://benchmarks.cekura.ai/stt), [V endpoint](https://soniox.com/docs/stt/rt/endpoint-detection), [V finalize](https://soniox.com/docs/stt/rt/manual-finalization), [V modelos](https://soniox.com/docs/stt/models) |
| **Deepgram Flux** (`flux-general-en`, `flux-general-multi`) | no está | en 108 / 141 ms; multi 114 / 141 ms | **0,020 s / 0,019 s** (el más rápido, pero 7,4 % de WER) | `EndOfTurn` en "~260 ms" [V]. `eot_timeout_ms` desde 500. `ForceEndTurn`. **`EagerEndOfTurn` + `TurnResumed`** | `Update` cada ~0,25 s | multi: 10 idiomas, con code-switching dentro de la frase vía `language_hint: [en, es]` [V] | [Cekura](https://benchmarks.cekura.ai/stt), [AA](https://artificialanalysis.ai/articles/new-streaming-speech-to-text-benchmark-aa-wer-streaming), [V](https://developers.deepgram.com/docs/flux/configuration), [V idiomas](https://developers.deepgram.com/docs/flux/language-prompting) |
| Deepgram Nova-3 | 247 / 298 ms | 103 / 155 ms | 0,06 s / 0,057 s | `endpointing` por silencio | sí | multi | [Pipecat](https://github.com/pipecat-ai/stt-benchmark) |
| AssemblyAI Universal-3.6 Pro (`universal-3-6-pro`) | 307 / 401 ms (el mejor WER) | 91 / 232 ms | U3 Pro: 0,47 s parcial | `mode: min_latency \| balanced \| max_accuracy`. `min_turn_silence` (50–10000 ms), `max_turn_silence` (por defecto 1536 ms), `ForceEndpoint` | sí | code-switching nativo [V] | [Pipecat](https://github.com/pipecat-ai/stt-benchmark), [V](https://www.assemblyai.com/docs/api-reference/streaming-api/universal-streaming.md) |
| AssemblyAI Universal-Streaming (en/multi) | 256 / 362 ms (en) | — | — | `min_turn_silence` por defecto 400 ms y `max_turn_silence` 1280 ms. Multi detecta el idioma por turno, no hace code-switching [V] | sí | por turno (6 idiomas) | [V blog](https://www.assemblyai.com/blog/real-time-transcription-code-switches-multilingual-speakers) |
| Cartesia `ink-2` | 299 / 328 ms (**p99 1584**) | 123 / 145 ms | endpoints externos 0,09 s; semánticos 0,21 s | `turn.eager_end`, `turn.resume`, `turn.end` | `turn.update` | en, fr, hi, ja, es | [Pipecat](https://github.com/pipecat-ai/stt-benchmark), [V](https://docs.cartesia.ai/build-with-cartesia/stt/latest) |
| ElevenLabs `scribe_v2_realtime` | 281 / 348 ms | — | 0,14 s / 0,13 s (el mejor WER en AA) | VAD commit, `vad_silence_threshold_secs` (1,5 s en el ejemplo) o commit manual | parciales a "~150 ms" [V] | 90+ idiomas | [Pipecat](https://github.com/pipecat-ai/stt-benchmark), [V](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/transcripts-and-commit-strategies) |
| Speechmatics Linden 1 (Agent STT) | 369 / 438 ms | 147 / 213 ms | — | `max_delay` de 0,7 a 4 s | sí | packs bilingües; Melia 1 y Oak 1 cambian de idioma solos [V] | [Pipecat](https://github.com/pipecat-ai/stt-benchmark), [V](https://docs.speechmatics.com/speech-to-text/realtime/output) |
| OpenAI `gpt-realtime-whisper` | 740 / 878 ms | 543 / 669 ms | — | `gpt-live-transcribe` (el recomendado hoy) **no tiene VAD de servidor**: VAD en el cliente + `input_audio_buffer.commit`, y `delay: minimal…xhigh` | deltas | sí | [V](https://developers.openai.com/api/docs/guides/realtime-transcription) |
| Gladia Solaria-1 | no está | no está | — | — | parcial ~103 ms, final ~270–300 ms [?] (blog propio) | code-switching nativo, 100+ idiomas [?] | [?](https://www.gladia.io/blog/agentic-ai-in-the-contact-center-autonomous-agents-and-the-stt-layer) |

Lo que importa para Instant:
- **El endpoint automático es lento comparado con la finalización forzada.** El techo más bajo de Soniox es `max_endpoint_delay_ms` = 500 (por defecto 2000), contra 38–260 ms finalizando a mano. Ya tenemos la señal de fin: soltar el botón o el clic del anillo. Con eso se manda `finalize` (Soniox) o `ForceEndTurn` (Flux) de inmediato, y el endpoint semántico queda solo de respaldo para el modo manos libres.
- **Los parciales ya sirven para disparar al LLM.** AA midió que el primer parcial tras el fin del habla tiene, en promedio, solo ~0,7 puntos de WER más que el final [B]. Flux garantiza que el texto de `EagerEndOfTurn` es idéntico al del `EndOfTurn` si no hay `TurnResumed` [V].
- En WER, AA de junio dejó a Soniox último: 11,9 % (probablemente v4) [B]. En cambio, Pipecat (1,11 %) y Cekura (2,54 %) lo ponen entre los buenos con v5.

## C. Técnicas con números publicados

| Técnica | Número | Estado | Fuente |
|---|---|---|---|
| LLM especulativo con un "fin de turno" anticipado (Flux `EagerEndOfTurn`) | recorta **"los últimos 100–200 ms"** a costa de **50–70 % más llamadas al LLM** | [V] | [Deepgram](https://developers.deepgram.com/docs/flux/voice-agent-eager-eot) |
| Parcial frente a final como entrada | el final es solo ~0,7 pp de WER más preciso que el primer parcial | [B] | [AA](https://artificialanalysis.ai/articles/new-streaming-speech-to-text-benchmark-aa-wer-streaming) |
| Finalizar a mano en Soniox | 38 ms p50 (Cekura) y 260 ms p50 (Pipecat, con el `stop_secs` del VAD incluido); pide ~200 ms de silencio antes de `finalize` | [B]/[V] | [Cekura](https://benchmarks.cekura.ai/stt), [V](https://soniox.com/docs/stt/rt/manual-finalization) |
| Conexión precalentada (DNS+TCP+TLS) | Desde la Mac por Wi-Fi, en frío: **~20 ms** a OpenRouter, Cerebras, Groq, Soniox y Perplexity (Cloudflare), **~65 ms** a Inception y **~210–300 ms** a Deepgram (RTT ~105 ms). Por red móvil TLS 1.3 cuesta ~2 RTT, o sea 100–300 ms (inferido). Los blogs dicen "100–400 ms en frío" | [M] / [?] | `curl -w` hoy; [?](https://callsphere.ai/blog/vw8c-connection-pool-warming-voice-agents-2026) |
| Caché de prompt en Cerebras | automática en todos los modelos, bloques de 128 tokens, TTL garantizado de 5 min (hasta 1 h), **sin descuento**, `prompt_cache_key` opcional. **No publica cuántos ms ahorra** | [V] / ms [?] | [V](https://inference-docs.cerebras.ai/capabilities/prompt-caching) |
| Caché de prompt en Groq | automática, se borra tras 2 h sin uso, **50 % de descuento**, solo modelos gpt-oss. **No publica cuántos ms ahorra** | [V] / ms [?] | [V](https://console.groq.com/docs/prompt-caching) |
| Caché en general (OpenRouter) | "hasta 80–90 %" menos de prefill y costo con un prefijo estable + `session_id` | [V] | [OR](https://openrouter.ai/docs/features/latency-and-performance) |
| Sobrecosto de OpenRouter | ~20 ms con formato OpenAI; +120–200 ms en Anthropic | [B] | [TrueFoundry](https://www.truefoundry.com/blog/openrouter-latency-on-anthropic-why-bringing-your-own-key-is-faster) |

Con prompts de 1–2k tokens el prefill en Cerebras y Groq ya es de pocos ms, así que la caché pesa poco en la TTFT de Instant. Pesa cuando el historial crece (inferido).

## D. APIs de búsqueda web más rápidas

| API · modo | p50 independiente [B] | Proveedor dice [V] | [M] hoy | Precio por 1k | Fuente |
|---|---|---|---|---|---|
| **Perplexity Search `search_type: "fast"`** (Photon) | no medida (Openbenchmarks probó `low`: 1,60 s) | **160 ms p50 / 230 ms p95** | **263 ms p50** (252–326), el modo estándar 714 ms | $1 | [V](https://www.perplexity.ai/hub/blog/photon), [V docs](https://docs.perplexity.ai/docs/search/fast-search) |
| **Parallel `mode: turbo`** | **315 ms** (media 348), pero 71,3 % de precisión | ~200 ms | — | $1 | [Openbenchmarks](https://openbenchmarks.com/web-search/fastest-search-api), [V](https://parallel.ai/products/search) |
| Exa `type: instant` | 386 ms (media 398), 97,7 % de precisión | < 250 ms | — (Exa sin crédito) | $7 | [Openbenchmarks](https://openbenchmarks.com/web-search/fastest-search-api), [V](https://exa.ai/docs/search/quickstart) |
| Firecrawl search | 471 ms | — | — | $5 | [Openbenchmarks](https://openbenchmarks.com/web-search/fastest-search-api) |
| Brave LLM Context / web | 590 / 613 ms | — | — | $5 | [Openbenchmarks](https://openbenchmarks.com/web-search/fastest-search-api) |
| Linkup `depth: "flash"` (alpha) | no medida (el modo `fast` dio 1,17 s) | < 200 ms, solo palabras clave | — | $5 | [V](https://docs.linkup.so/pages/documentation/endpoints/search/overview) |
| Tavily `search_depth: "ultra-fast"` | no medida (`basic` dio 1,69 s) | "near-instant", sin cifra [?] | — | $8 | [V](https://docs.tavily.com/documentation/best-practices/best-practices-search) |

Openbenchmarks corrió el 26/09/2026 con 300 preguntas de noticias de empresas.

## Candidatos para el banco de pruebas

**LLM**
1. `openai/gpt-oss-120b` con `provider.order: ["cerebras"]` y `reasoning.effort: "low"`.
2. `qwen/qwen3.8-27b` con `provider.order: ["cerebras"]` y `reasoning.effort: "none"`.
3. `openai/gpt-oss-120b` con `provider.order: ["groq"]`.

De comodín, `meta-llama/llama-3.1-8b-instruct` en `groq`: fue el más rápido medido (162 ms), pero es un modelo viejo.

**STT**
1. Soniox `stt-rt-v5` (ya integrado) con `finalize` manual al soltar.
2. Deepgram `flux-general-multi` con `language_hint: ["es","en"]`, `ForceEndTurn` y `EagerEndOfTurn`.
