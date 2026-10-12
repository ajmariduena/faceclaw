# Review: orquestador de Paseo por voz en las gafas (Fable, 11 oct 2026)

Veredicto: la idea encaja y casi todo el protocolo ya existe; el fork `a6efb66` confirma `voice.messages.*` tal como lo describe la propuesta. Hay un problema de seguridad en el «sí», tres huecos de implementación que la propuesta no ve, y dos piezas que conviene cortar (fase 3 y audio de vuelta). Ordenado por importancia.

## 1. El «sí» aprueba cosas que no estás mirando (seguridad)

- En el fork, al anunciar un único permiso el router arma un *challenge* de 120 s (`router.ts:384`, `CHALLENGE_TTL_MS`). Mientras viva, cualquier «sí» a secas lo ejecuta sin modelo (`confirmationFastPath`). Un turno normal en medio **no lo borra**: solo lo borran un no, un sí o el vencimiento (`router.ts:307-328`).
- Escenario: aviso «faceclaw-ui pide permiso para Bash…» → preguntas «¿cuántos agentes corren?» → responde «Tres, ¿te los leo?» → dices «sí» → se aprueba el Bash. En audio se nota menos porque oíste la pregunta; en 576×288 con el aviso en tenue de una línea, no.
- Cambios: (a) los avisos de permiso van **enteros y en blanco**, nunca truncados a una línea; (b) añadir al fork un `status` con `code: "confirm_pending" | "confirm_cleared"` y la etiqueta (`call.label`) para que el pie diga `· Yes approves: Bash in faceclaw-ui` mientras el challenge viva y nada cuando no; (c) sin ese pie, no vender el «sí»: aprobar desde el chat del agente con los botones que ya existen. Alternativa en el fork: borrar el challenge cuando llega un utterance que no es sí ni no.

## 2. Hay que hacer `sync` aunque no reabras (feasibility)

- Los avisos quedan «oídos» solo cuando el cliente hace `sync {afterSeq}` pasado su `seq` (`messages-call.ts: ackWaiters`). Si Faceclaw solo escucha `voice.messages.update` y nunca sincroniza, cada aviso se marca no oído y se **repite hasta 2 veces** (`UNHEARD_MAX_REPEATS`) en segundos: tres copias en el chat.
- El cierre por inactividad es **20 min, no 30** (`IDLE_CALL_MS`), y cuenta solo peticiones del cliente (`receive`/`sync`/`readAudio`); los avisos no la renuevan. Minimizado y callado, se cierra a los 20.
- Al reconectar el relay, los updates pertenecen al **último socket que habló** (`claimUpdates`); sin un `sync` tras reconectar, las gafas dejan de recibir.
- Cambio: `sync` al recibir cada update (ack inmediato; lo «no leído» lo lleva Faceclaw con la línea gris que ya hay sobre el mensaje más nuevo), `sync` tras cada reconexión, y un `sync` cada 60 s mientras está minimizado. Faceclaw cierra la llamada él mismo 30 min después del último utterance (`end`), porque con el keepalive el daemon no la cerrará.

## 3. Cortar fase 3 (PCM) y el audio de vuelta; adelantar la fase 4

- `transcribeClip` sí acepta `audio/pcm;rate=16000` (envuelve en WAV, `elevenlabs/stt.ts:139`), así que la duda del `mimeType` está resuelta, pero no conviene: hoy el dictado transcribe **mientras hablas** y el texto llega 1,5 s después del último chunk; con PCM subes el clip entero al soltar (≈43 KB/s en base64 por el relay) y luego Scribe por lotes. Más lento, no menos.
- La gracia de 2,5 s (`AUDIO_GRACE_MS`) sí penaliza la fase 1. Hacer primero el flag `noAudio` en el fork (media hora) y medir: dictado 1,5 s + router 0,2–0,5 s + herramienta. Objetivo: respuesta en pantalla en 2–3 s.
- Audio de vuelta: el daemon **sintetiza TTS de cada reply y aviso** aunque nadie lo escuche (`addSpokenItem` → `synthesize`). Las gafas pagarían ElevenLabs por audio que descartan. Añadir `audio: false` al `start.request` y saltar la síntesis. Oírlo en el teléfono es otro producto; fuera del alcance.
- `greet` por defecto es `true` y mete «Hola, aquí estoy.» como primer item: pasar `greet: false`. Y pasar `language: "es"` siempre: `start` hace `setPreferredLanguage(msg.language ?? null)` y sin el campo **borra** el idioma del daemon.

## 4. Avisos: no inventar una capa nueva

- Las *ambient cards* miden 230 px, fuente pequeña, truncan a 1+3 líneas y se publican desde el hilo principal (`chrome-layer.ts:952`, `mic-session.ts:806`); desde el worker haría falta un mensaje nuevo al shell. Una oración no cabe. Y «pie del home `· Orchestrator on`» es un concepto nuevo: el home no tiene pie, y la tarjeta Paseo quedó en conteos pelados.
- Cambio: el mismo camino que ya usa `noteAttention` (`set-attention` + buzz + `wake-window` → lista con la fila seleccionada). Permiso: `NEEDS_BUZZ` y despierta; terminó/falló: `DONE_BUZZ` sin despertar. La fila `Orchestrator` lleva el estado (`on` o el último aviso en tenue). Un solo buzz por evento: con la llamada viva, el aviso del orquestador manda y la detección por agente solo marca atención. Nota: `wake-window` exige ventana abierta; si se cierra la ventana de Paseo, no hay despertar aunque el worker siga vivo.
- Pregunta abierta 3, ya respondida por el fork: solo permiso siempre, y terminó/error de agentes que mandaste desde la llamada (`isWorthSaying`); «started» y «progress» no se narran. Dejarlo así.

## 5. Chat y gestos: detalles

- Los avisos son texto narrado por el modelo, 1–3 oraciones que empiezan por el workspace (`buildNarrationPrompt`), no `· faceclaw-ui finished`. Mostrarlos enteros, lado del asistente, en gris, una oración por línea; nunca una línea truncada.
- Un `reply` llega dos veces con el mismo `seq`: texto primero y luego con `audio` (`addSpokenItem`). Hay que **upsert por `seq`**, no append, o se duplican respuestas.
- Mientras escuchas, doble tap debe **cancelar el dictado** (como hoy en `goBack`), no minimizar. Minimizar solo con el chat en reposo.
- Enviar directo al soltar, sin la revisión Send/Edit/Discard del dictado actual: eco local del texto como `heard` y reemplazo por el item del servidor vía `utteranceId`. Pie `· Listening 0:04` → `· Thinking`; con `status not_heard` → `Nothing heard.`; con `backend_failed` → la respuesta ya viene («No pude procesarlo ahora. ¿Me lo repites?»).
- Entrada: la fila fija vale; quitar la entrada por la tarjeta del home (su tap ya abre el agente urgente) y añadir «Talk to Paseo» al menú tap+hold de la lista, que es donde viven las acciones.
- Un `start` con `callId` nuevo **cierra cualquier otra llamada**, incluida una live del teléfono (`hub.start` → `closeLiveCall`). Si estás en llamada por el teléfono, las gafas la tiran. Avisarlo en el pie o reusar el `callId`.

## Preguntas abiertas: recomendación

1. **Conversación:** una sola. `callId` estable; al reabrir, `sync`; si `active: false`, `start` con el mismo id y `history` = las últimas 24 líneas guardadas en Faceclaw (`HISTORY_LIMIT`), `greet: false`.
2. **Audio:** solo texto. Flag `audio: false` en el fork para no sintetizar.
3. **Avisos:** permiso, error y terminado, como ya decide el fork. Nada de started/progress.

## Estados de fallo

- Relay caído: `PaseoRequestError disconnected`; reconexión con backoff ya existe; al volver, `sync`. Los utterances son idempotentes por `utteranceId`: reintentar el mismo; si responde `call_not_found`, `start` + reenviar.
- Mic no disponible: `handleRawMicState` ya cae al diálogo de voz del teléfono; mismo camino.
- Daemon dormido: el relay no entrega; pie con el `connectionStatus` actual («Reconnecting…»), sin pantalla nueva.
- Orquestador no disponible: `start.response.error` («The voice assistant is not available on this host.») en el pie y vuelta a la lista.

## Fases revisadas

1. Fork: `noAudio`, `audio: false`, `confirm_pending/cleared` (medio día). 2. Texto con dictado + chat con upsert + sync/ack (1 día). 3. Minimizar con keepalive, avisos por el camino de `noteAttention`, fila con estado (1 día). Sin fase de PCM.
