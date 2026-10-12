# Orquestador de Paseo por voz en las gafas (propuesta, 11 oct 2026)

Hablas, el orquestador de tu fork de Paseo contesta en las gafas como chat. Lo abres, lo minimizas y sigue vivo. Revisado con Fable (`orquestador-voz-review-fable.md`).

Renders con los painters de producción: `node tools/headless-render/orquestador-scenes.cjs` → `out/orq-*.png`.

## Qué ya existe

- **Fork de Paseo** (`packages/server/src/server/voice-orchestrator/`): orquestador con modelo rápido que convierte lo que dices en `send_message`, `start_agent`, `stop_agent`, `read_agent`, `answer_permission`, `archive_agent`, `create_workspace`, `host_health`. Narra avisos de permiso siempre, y de terminado/error de los agentes que mandaste desde la llamada.
- **Modo messages**: `voice.messages.start` / `send_utterance` / `update` (heard, reply, notice, status) / `sync` / `end`. Cada llamada queda grabada en la Mac en `~/.paseo/voice/calls/<fecha>/`.
- **Faceclaw**: cliente del protocolo (`app/apps/paseo/paseo-client.ts`), relay pareado, dictado por el daemon desde el mic de las gafas, y el chat de Paseo / AI Chat en `app/graphics/terminal-painter.ts`.

## Diseño

Mismo marco que las otras apps de chat: `paintList`, `paintChat` y la caja de permiso, sin elementos nuevos.

1. **Entrada**: fila `Orchestrator` arriba de la lista de Paseo, seleccionada al entrar. Tap abre el chat y empieza la llamada.
2. **Chat** (`paintChat` con `full`): tú a la derecha, el orquestador a la izquierda, respuestas enteras con una oración por línea, línea sobre lo más nuevo, pie `· Orchestrator  Ready`. Los avisos narrados de agentes van enteros en tenue (`action`).
3. **Hablar**: tap empieza y termina, como el dictado de hoy. Texto en vivo a la derecha, pie `· Listening 0:04`, luego `· Thinking 1.4s`. Se envía directo al soltar, sin Send/Edit/Discard. Doble tap mientras hablas cancela.
4. **Permisos**: la caja de permiso existente (Allow once / Deny) con el ring. No se aprueba con un «sí» hablado: en el fork un «sí» a otra pregunta puede aprobar un permiso pendiente (challenge de 120 s).
5. **Minimizar**: doble tap vuelve a la lista con la llamada viva. La fila dice `Orchestrator · 1 new`; los avisos vibran por el mismo camino de `noteAttention` (permiso despierta, terminado/error solo vibra). Sin tarjetas ni pie nuevo en el home.
6. **Cerrar**: tap+hold en el chat → `End`. Faceclaw cierra solo 30 min después de lo último que dijiste.
7. **Historial**: una sola conversación (`callId` estable); al reabrir se ve lo de antes. Las llamadas pasadas ya están en la Mac; para abrirlas desde las gafas hace falta una petición nueva en el fork (lista de llamadas + transcripción) y se mostrarían con el mismo chat.
8. **Audio de vuelta**: no. Solo texto.
9. **Fallos**: solo en el pie (`Reconnecting…`, `Nothing heard.`, `Not available on this host.`).

## Detalles de implementación (de la revisión)

- `sync` al recibir cada update, tras cada reconexión y cada 60 s minimizado; si no, los avisos se repiten y el daemon cierra la llamada a los 20 min.
- Upsert por `seq`: cada reply llega dos veces (texto y luego con audio).
- `start` con `language: "es"`, `greet: false`; al reabrir con llamada inactiva, `start` con el mismo id y `history` local.
- Un `start` nuevo cierra cualquier otra llamada, incluida una del teléfono: reusar el `callId`.

## Fases

1. **Fork (medio día)**: flag `noAudio` (evita la espera de 2,5 s), `audio: false` (no sintetizar TTS que nadie oye).
2. **Chat (1 día)**: fila, chat, dictado → `send_utterance` como texto, upsert y sync.
3. **Minimizar (1 día)**: llamada viva en el worker, avisos por `noteAttention`, contador en la fila, cierre por inactividad.
4. **Historial (1 día, opcional)**: petición en el fork para listar y leer llamadas pasadas, lista en las gafas.

## Riesgos

- El modo messages es del fork y el protocolo no es API estable.
- Latencia objetivo de 2–3 s por respuesta; medir en la fase 2.
