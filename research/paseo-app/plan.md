# App Paseo para las gafas

Objetivo: desde las gafas ver los agentes del daemon de Paseo (el fork `~/Documents/Personal/paseo`), saber cuál te necesita, leer qué hizo, responder por voz y aprobar permisos. Se parte de la app T3 Code de Faceclaw (`app/apps/t3code/`), que ya resuelve lo mismo para otro servidor.

## Qué se reutiliza y qué es nuevo

| Pieza | T3 Code | Paseo |
|---|---|---|
| Worker, ventana, gestos, menú tap+hold | `t3code-app.worker.ts` | se copia y se adapta |
| Lista con secciones y marcadores (! ? … ● x ✓) | `Menu` + `drawListRow` | igual |
| Transcript (mensajes, pasos colapsados, solicitudes) | `t3-transcript.ts` | igual; solo cambia el mapeo de entradas |
| Voz para responder | `start-voice-input` del shell | igual |
| Despertar y vibrar al necesitarte | `wake-window`, `buzzer-sequence`, `set-attention` | igual |
| Widget en Glanceboard | `t3-glance.ts` | igual, con otros datos |
| Pairing | link de `t3 pair` + ticket HTTP | link de `paseo daemon pair` o `ws://host:6767` + contraseña |
| Cliente y protocolo | `t3-client.ts`, `t3-rpc.ts`, `t3-auth.ts` | `@getpaseo/client` del fork, empaquetado en el worker |
| Modelo | `t3-model.ts` | `paseo-model.ts` nuevo, sobre `AgentSnapshotPayload` y el timeline |

## Conexión

- El SDK `DaemonClient` acepta `webSocketFactory` (`packages/client/src/daemon-client.ts:418`); se adapta `native/socket.ts` (OkHttp) a `WebSocketLike`.
- **Relay, camino principal:** el daemon escucha solo en `127.0.0.1:6767` y ya tiene el relay activo, así que se usa el link de pairing (`#offer=` con `daemonPublicKeyB64`), por `relay.paseo.sh` con E2EE NaCl, sin tocar la config del daemon y desde cualquier red. Hace falta `crypto.getRandomValues` en el worker: un polyfill con `java.security.SecureRandom`, porque `tweetnacl` lo exige (`packages/relay/src/crypto.ts:51-61`).
- **Directo, alternativa:** `ws://<mac>:6767/ws` por Tailscale con contraseña en el subprotocolo `paseo.bearer.<pw>`; requiere cambiar `daemon.listen` y poner contraseña.
- Cliente y daemon salen del mismo fork; el protocolo no es estable, así que se fija la versión.

## Mapeo de estados

- **Te necesita:** `pendingPermissions` no vacío, o `agent_attention_required` con razón `permission`.
- **Trabajando:** estado `running`.
- **Recientes:** `idle` o `error`, ordenados por actividad; ● si terminó y no lo has abierto, x si falló.
- Archivados y subagentes (label `paseo.parent-agent-id`) ocultos: solo agentes de primer nivel.

Acciones: responder (`send_agent_message_request`), aprobar o rechazar (`agent_permission_response`), detener (cancel) desde tap+hold. Crear agentes nuevos queda fuera de la primera versión.

## Fases

1. **Cliente en Node (1 día, hecho):** script local con el SDK contra el daemon de la MacBook: listar, leer el timeline, enviar y aprobar. Valida el mapeo sin tocar el teléfono.
2. **Conexión en Faceclaw (2–3 días):** SDK empaquetado en un worker con el adaptador de socket y el polyfill de `getRandomValues`, link de pairing en el teléfono, conexión por relay, reconexión con backoff. Prueba en el Infinix en Preview Only.
3. **Pantallas (3 días):** lista e hilo copiados de T3, con el modelo de Paseo. Primero renders headless (`tools/headless-render`), luego el teléfono.
4. **Acciones y atención (2–3 días):** dictado por el daemon, permisos, detener; despertar y vibrar con `agent_attention_required`; widget.

Total: unos 9–10 días. Prueba final en las gafas junto con la de v3 (firmware 37).

## Decisiones (7 oct 2026)

- Interfaz en inglés, como T3 Code.
- Dictado en español con el mismo modelo que usa Paseo (ElevenLabs Scribe v2 realtime, `es`), a través del dictado del daemon: el audio crudo de las gafas (16 kHz mono S16LE, `RawPcmListener` en `native/voice-control.ts:87,213`) va por `dictation_stream_*` y la clave se queda en la Mac. Hay que llevar ese tap del hilo principal al worker.
- App propia dentro de «Más» por ahora; la tarjeta en el home es un extra para después.
- Rama `feat/paseo-app` desde `main` (worktree `~/Documents/Personal/faceclaw-paseo`).

## Fase 1: resultado

Scripts en `tools/paseo-probe/`, con el SDK del fork contra el daemon local (0.11.0-beta.3-canary.33):

- `probe.mjs`: lista los 46 agentes activos con estado y atención, y lee el timeline (`user_message`, `assistant_message`, `tool_call`, `compaction`).
- `roundtrip.mjs`: agente desechable con Haiku en modo `default`; pide permiso para Bash (`kind=tool name=Bash`), se aprueba con `respondToPermission`, termina, responde un seguimiento y se archiva. Unos 7 s en total.
- `dictation.mjs`: 3 s de voz en español a 16 kHz; el texto final llega 1,5 s después del último chunk: «Revisa el último commit y dime si los tests pasan.»

Para la lista hará falta filtrar: con 46 agentes activos conviene mostrar los que te necesitan, los que trabajan y los recientes de las últimas horas, y ocultar subagentes.

## Diseño aprobado (8 oct)

- **Marco:** el modo terminal de Even, igual para toda la interfaz de Faceclaw: una caja redondeada de 1 px, fuente stock con paso de 27 px, una línea fina sobre un pie de estado («· Working  1m», «· Listening  0:04») y ninguna instrucción en pantalla. Los textos de la interfaz van en inglés; el contenido, en el idioma original.
- **Widget en el home v3:** tarjeta «Paseo» junto a Calendario con las dos últimas novedades (agente y edad en tenue, oración de Luna en blanco). Se actualiza cuando cambia un agente, agrupando cambios durante unos 1–2 s.
- **Lista:** las secciones del sidebar de Paseo (Needs input, Failed, Ready to review, Working, Done), con el conteo a la derecha y «>» en la fila elegida. Solo agentes de primer nivel, sin subagentes.
- **Chat:** solo tus mensajes (a la derecha) y las respuestas del agente resumidas por Luna (a la izquierda). No se muestran pasos ni comandos. Una sola línea, del mismo gris que la del pie, encima del mensaje más nuevo. Lo nuevo en blanco y lo anterior más tenue. Se muestran mensajes enteros desde el último hacia atrás; con el ring se sube. Mientras dictas, tu texto aparece como mensaje nuevo a la derecha.
- **Elección:** Fable y Astra eligieron por separado `ruleslatest` (`tools/headless-render/paseo-chat-fable.cjs` en el worktree de v3). Pendiente para la prueba en gafas: si la línea de 1 px no se ve al caminar, subirla a 2 px.
- **Datos reales:** `tools/paseo-probe/real-sessions.mjs` saca tus sesiones del daemon y las resume con Luna en unos 8–9 s por sesión (en la app esto lo hará el daemon).

## Resumen de una oración con Luna

Las respuestas de los agentes son largas para 576×288. La idea es que, cuando el cliente es de las gafas, cada turno terminado traiga una oración que diga qué pasó y qué necesita de ti. Tocando, se ve el texto completo.

- Luna (`gpt-6-luna` por codex) ya es el modelo de `agents.metadataGeneration` del daemon, y el read-aloud del fork ya lo usa para reescribir respuestas (`packages/server/src/server/speech/read-aloud/`).
- Medido el 7 oct: 554 palabras reescritas en unos 5 s con `speech.read_aloud.prepare`. La primera oración del guion ya funciona casi como resumen.
- Cambio en el fork de Paseo: un modo `glance` junto al read-aloud, con prompt de una oración de 25 palabras como máximo, en el idioma de la respuesta, que termine con la pregunta si hay decisión pendiente. Se cachea por mensaje y solo se calcula cuando lo pide un cliente de gafas.
- En Faceclaw: la oración va bajo el título en la lista y arriba del hilo; con tap se ve la respuesta completa. Mientras llega el resumen se muestra la primera línea del texto.
- Costo: una llamada a Luna por turno terminado que veas en las gafas. Más o menos 1 día extra, entre los dos repos.

## Riesgos

- El SDK pesa: unas 7.400 líneas en `daemon-client.ts`, más zod 4. Hay que confirmar que corre en el V8 de NativeScript y medir el tamaño del bundle. Plan B: cliente mínimo propio con solo los mensajes de arriba.
- Faceclaw no tiene popups genéricos: el aviso solo despierta las gafas si el worker está vivo (ventana abierta o widget activo), igual que en T3.
- La conexión directa depende de que la Mac esté despierta y en Tailscale.
