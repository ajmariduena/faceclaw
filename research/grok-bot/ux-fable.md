# Grok Bot en las gafas: la app Bots, un bot por defecto y respuestas que tardan (Fable, 10 oct 2026)

> **Revisión (mismo día):** el transporte cambió. `api.md` ya no usa relé, webhook ni MCP: el teléfono habla directo con `api.cursor.com/v0/grokbot` (sesión por nombre, `messages`, polling de `entries`, `interrupt`). Lo que sigue en pie de esta propuesta es la tarjeta Bots, la lista que funciona como selector y bandeja, Quick, el estado «Working», la respuesta tardía con vibración, la paginación y los strings. Cambia lo siguiente:
> - **Historial**: se lee de `entries`, no hace falta copia local.
> - **Cancel**: ahora es `interrupt` real y corta el turno.
> - **Lista de Bots**: son nombres que el usuario guarda en el teléfono, no la lista del relé. Los errores son «Cursor key rejected» u «Offline», no «Relay unreachable».
> - **Needs you**: se detecta por el `kind` de la entrada, no con `glasses_needs_you`.
> - **Resumen**: no hay campo `summary` y el resumen se corta en el teléfono.
> - **Herramientas de las gafas**: Grok Bot ya no las llama directamente.

Diseño sobre `research/grok-bot/api.md` (sin API de chat: webhook de entrada, MCP `glasses_reply` de salida por un relé que habla el puente actual), el lean aprobado (`lean-spec.md`, `lean-ux-fable.md`) y el código de hoy (`app/apps/ai-chat/`, `app/apps/paseo/`, `app/graphics/terminal-painter.ts`, `app/assistant/`). Renders con los painters de producción en `tools/headless-render/grok-bot-fable.cjs` → `out/grok-*.png`. No se tocó código de la app.

## 1. Dónde vive: tarjeta **Bots**, segunda del home

Grok Bot no es un chat rápido: es una bandeja. Las respuestas llegan segundos o minutos después, los routines escriben solos y un bot puede quedarse esperando una aprobación en la app de Grok Bot. Eso sí tiene valor de un vistazo, que fue el único motivo para dejar AI Chat en More. Por eso **Bots sube a tarjeta y AI Chat sale de More**: el home queda **Paseo → Bots → Calendar → Translate → Converse → More**, seis puntos (`grok-home-bots.png`, `grok-home-bots-needs.png`), y More queda en tres filas: Timers, Navigate, Settings (`grok-more-list.png`). Costo: el ciclo circular del anillo tiene una tarjeta más (máximo tres scrolls a cualquiera, antes dos). Despertar sigue mostrando Paseo.

La tarjeta usa la geometría de la tarjeta Paseo (`paintHome`): dos novedades, bot y edad en tenue, línea en blanco, primero los que te necesitan («Atlas · needs you»), luego los más recientes. Sin relé: «Relay unreachable» en tenue; sin pairing: «Not paired».

**«Hey Even» abre el chat del bot por defecto escuchando** (hoy abre AI Chat). Única excepción, la misma regla que ya tiene el overlay (`shell.ts:968`): si un chat de Bots está en pantalla, la voz va a ese bot. El dictado es a ciegas, así que el destino tiene que ser predecible; el pie «· Listening» muestra a quién le hablas.

**El choque con lean se resuelve quitando el backend global.** Lean fijó `assistant.backend = on-phone`; aquí el backend pasa a ser **por bot**: cada fila de Bots es `{kind: "relay", botId}` o `{kind: "direct", llm}`. El modelo rápido del teléfono sigue existiendo como un bot más, **Quick**, última fila de la lista, siempre presente, con las herramientas de hoy (timers, alertas, navegación) y respuesta en un segundo (`grok-chat-quick.png`). No hay selector de modelo ni de razonamiento: Grok Bot no deja elegir modelo y Quick queda fijo en `gpt-oss-120b` vía OpenRouter, como manda lean.

## 2. La app: lista y chat, el mismo esqueleto que Paseo

| Pantalla | Qué muestra | Tap | Doble tap | Scroll | Tap + mantener |
|---|---|---|---|---|---|
| Lista (`grok-bots-list.png`) | Una fila por bot en el orden del teléfono, estado a la derecha; pie «· Bots  1 new · 1 working» | Abre el chat | Home, tarjeta Bots | Fila | Pair again, Reconnect now, Unpair |
| Chat (`grok-chat-atlas.png`) | `paintChat` tal cual: tú a la derecha, el bot a la izquierda, dos líneas por mensaje, pie «· Atlas» | Dicta; borrador Send / Edit / Discard (`grok-chat-draft.png`) | Lista | Historial | Full reply, Cancel, Clear history (Quick: New session) |
| Full reply (`grok-reply-page-1.png`, `-2.png`) | El texto completo, siete líneas por página, pie «· Atlas  1/2» | — | Chat | Página anterior / siguiente | — |

**Cambiar de bot = doble tap, scroll, tap.** No hay submenú «Switch bot»: la lista es el selector y a la vez la bandeja, y el orden fijo da memoria muscular al anillo (Paseo ordena por bucket porque son decenas de agentes; aquí son tres o cuatro). Al abrir, el «>» queda en el último bot visto; al despertar por una respuesta, en el que respondió.

Estados de la columna derecha: «1 new» (respuesta sin leer), «working 4 min», «needs you · app», «on phone» (Quick), «paused», «offline», vacío cuando no hay nada. Lista vacía de relé: solo Quick y pie «No bots on the relay» (`grok-bots-list-empty.png`).

**Historial por bot, local y honesto.** Grok Bot no deja leer su transcript, así que cada bot guarda en el teléfono lo enviado y lo que volvió por el relé (`conversations.ts` pasa de «conversaciones por modelo» a «una por bot»). «Clear history» borra solo esa copia; el bot sigue recordando en su app, y el menú lo dice: «Clear history here». Quick conserva «New session» porque ahí la sesión sí es el contexto del modelo.

## 3. Latencia larga: enviar y seguir con tu vida

| Momento | Chat | Pie | Lista / tarjeta |
|---|---|---|---|
| Send | Tu línea en blanco a la derecha | «· Sent» | «sending» |
| Webhook 200 (`grok-chat-sent.png`) | Igual | «· Working  0:12», cuenta | «working 0:12» |
| Código distinto de 200 (`grok-chat-send-failed.png`) | «> Not started · webhook rejected (401)» o «> Not started · Atlas is paused in Grok Bot» | «· Atlas  Failed» | «failed» |
| Respuesta (`grok-chat-reply.png`) | Resumen en blanco; «more» a la derecha si hay texto completo | «· Atlas  more» | «1 new» hasta abrir el chat |
| 15 min sin nada (`grok-chat-waiting-long.png`) | «> No reply yet · see Grok Bot app» | «· Working  16m» sigue contando | «working 16m» |
| Cancel (`grok-chat-cancelled.png`) | «> Cancelled here · Atlas keeps working in Grok Bot» | «· Atlas» | vacío |

**Puedes irte siempre.** Doble tap vuelve a la lista y al home, la pantalla se apaga sola a los 15 s y el turno sigue vivo en el teléfono (`pendingTurns` por bot, persistido: sobrevive a reiniciar la app; hoy `bridge-client.ts` corta a los 3 min). No se bloquea el envío mientras un bot trabaja: cada pregunta es un run y el pie suma «· Working  2m · 2 pending». Qué hace Grok Bot con dos runs seguidos es la medición 3 de `api.md`.

**Cómo llega una respuesta tardía** (mismo mecanismo que Paseo, `paseo-app.worker.ts:460-480`):

| Estado de las gafas | Qué pasa |
|---|---|
| Pantalla apagada | Buzz corto (DONE_BUZZ), despierta y abre **el chat del bot** con la respuesta (Paseo despierta a la lista porque allí hay que actuar; aquí hay que leer). Ajuste «Wake when a bot replies», encendido |
| Home encendido | La tarjeta Bots se repinta; buzz corto |
| Otra app al frente (Translate grabando, Paseo) | Buzz corto, nada más: nunca se roba la pantalla. La tarjeta lo muestra al volver |
| Ese chat al frente | Aparece sin buzz |

**Cancel solo cancela aquí.** El webhook no tiene cancelación. El relé marca el `turn_id` descartado y tira la respuesta cuando llegue; el run sigue gastando uso semanal, y la línea lo dice tal cual. No se ofrece «Stop»: sería mentir.

## 4. «Needs you in Grok Bot app»

Aprobaciones, logins y secretos viven en la app de Grok Bot; las gafas solo pueden avisar (`grok-chat-needs-you.png`). Dos vías:

1. **Principal:** el MCP expone `glasses_needs_you(turn_id, reason)` y la skill del Bot le pide llamarla antes de detenerse a esperar. Llega como `> Needs you in Grok Bot app · approve booking`, pie «· Atlas  Needs you», lista «needs you · app», tarjeta «Atlas · needs you», buzz doble (NEEDS_BUZZ) y despertar como en Paseo.
2. **Respaldo:** el lector de notificaciones del Android sobre la app de Grok Bot («needs input»). Sin texto fiable; marca el estado sin el motivo. Por verificar (puerta 3 de `api.md`).

El estado se limpia solo cuando ese bot vuelve a llamar `glasses_reply`. Si el Bot se bloquea antes de llamar la herramienta, solo la vía 2 lo ve: medición 5.

## 5. Mensajes proactivos (routines)

`glasses_reply` sin `turn_id` es un mensaje del bot por iniciativa propia (`grok-chat-proactive.png`): entra al chat de ese bot con una línea tenue «> Routine · Morning brief · 07:00» y el texto en blanco; lista y tarjeta marcan «1 new». **No despierta ni vibra**: un brief de las 07:00 no tiene por qué encender las gafas en el estuche; ajuste «Wake for routine messages», apagado. Si un routine quiere interrumpir usa `glasses_show_alert`, que ya existe, ya vibra y ya está limitado a 6/min.

## 6. Respuesta larga: resumen en el chat, Full reply para leer

`paintChat` corta cada mensaje a dos líneas, a propósito. Por eso `glasses_reply` pide dos campos: `summary` (una o dos líneas, ≤ 100 caracteres, lo que irías a leer en las gafas) y `text` (todo). El chat muestra `summary`; sin él, las dos primeras líneas con «…». Cuando hay más texto, el pie dice «more» a la derecha y tap + mantener → **Full reply** abre las páginas (`grok-reply-page-1.png`): siete líneas por página, scroll pasa página, pie «1/2», doble tap vuelve. Es el mismo dato que Paseo pide al daemon como glance summary, solo que aquí lo produce el Bot. Painter nuevo, `paintReplyPages`, con las constantes de `terminal-painter.ts`.

## 7. Teléfono: página **Bots**

Reemplaza a «Assistant backend / bridge host / port / token» de `dashboard-settings.ts:813-873`. Las claves de los webhooks **no pasan por el teléfono**: viven en el relé.

| Sección | Filas | Estado |
|---|---|---|
| Relay | URL (`wss://…`), token, botón **Test** | «Connected · 3 bots · 09:41», «Unreachable (timeout)», «Token rejected (401)», «Not set» |
| Bots (del `hello-ack`) | Nombre, **Default** (uno), **Hide**, orden con flechas; debajo, el último error de ese bot | «OK · last reply 2 min ago», «Webhook rejected (401)», «Paused in Grok Bot», «Run not started (HTTP 404)» |
| Quick | Fila fija; estado de la clave OpenRouter de API keys | «Ready», «OpenRouter key missing» |
| Wake | «Wake when a bot replies» (on), «Wake when a bot needs you» (on), «Wake for routine messages» (off) | — |
| Vacío | «No bots on the relay yet» y botón **Manage bots on the relay** (abre el admin del relé, donde se pegan URL y key de cada webhook) | — |

Errores en las gafas: lista con mensaje «Relay unreachable · retrying» y pie «Offline» (`grok-bots-list-unreachable.png`); en el chat, la misma línea tenue y el envío se queda en borrador (`grok-chat-relay-down.png`), nunca se pierde el dictado.

## 8. Strings (inglés, por estado)

| Dónde | Strings |
|---|---|
| Home | «Bots», «Atlas · now», «Atlas · needs you», «Research · working 4 min», «Relay unreachable», «Not paired» |
| Lista | «· Bots», «1 new», «working 4 min», «needs you · app», «on phone», «paused», «failed», «offline», «1 new · 1 working», «No bots on the relay», «Relay unreachable · retrying», «Offline» |
| Chat | «· Atlas», «· Listening  0:03», «· Sent», «· Working  0:12», «· Working  2m · 2 pending», «more», «Needs you», «Failed», «Offline», «on phone» |
| Líneas de acción | «> Needs you in Grok Bot app · approve booking», «> No reply yet · see Grok Bot app», «> Cancelled here · Atlas keeps working in Grok Bot», «> Not started · webhook rejected (401)», «> Not started · Atlas is paused in Grok Bot», «> Relay unreachable · retrying», «> Routine · Morning brief · 07:00», «> Timer · 10 min» |
| Menús | «Full reply», «Cancel», «Clear history here», «New session», «Pair again», «Reconnect now», «Unpair» |
| Teléfono | Los de §7 |

## 9. Qué cambia en el código

- `app/apps/home/home-model.ts`: tarjeta `bots` (icono `sparkles`) entre Paseo y Calendar; `home-painter.ts` reutiliza la rama Paseo para la tarjeta; `more-list.ts` pierde la fila AI Chat.
- `app/apps/bots/` (nueva, a partir de `ai-chat-app.ts`): lista con `paintTerminalList`, chat con `paintChat`, `paintReplyPages`, snapshot glance (`bots-glance.ts`, calco de `paseo-glance.ts`), buzz y wake copiados de `paseo-app.worker.ts:453-490`.
- `app/assistant/conversations.ts`: una conversación por bot con `backend` propio y `pendingTurns`; `session.ts` acepta turnos sin tope de tiempo cuando el backend es relé.
- `app/assistant/bridge-client.ts`: `wss://`, `bot` en `utterance`, `bots[]` en `hello-ack`, `glasses_needs_you`, `summary` en `text-delta`/`turn-done`, respuestas sin turno como mensaje de chat.
- `app/ui/shell/shell.ts`: el wakeword abre Bots con el bot por defecto escuchando; regla «si un chat de Bots está en pantalla, ese bot».
- `app/ui/dashboard-settings.ts` y `app/phone-ui/`: fuera backend/bridge; página Bots (§7) y tres ajustes de wake.
- Relé (repo aparte): MCP con `glasses_reply(turn_id?, summary, text)`, `glasses_needs_you`, `glasses_show_alert`, `glasses_call`; admin mínimo para las keys; descarte de turnos cancelados.

## 10. Preguntas abiertas (dependen de las mediciones de `api.md`)

1. **Latencia.** Si la mediana baja de ~8 s, el pie «Working» en pantalla basta y el despertar es raro; si son minutos, el modelo de bandeja de §3 manda y conviene un router local (Jev, ~300 ms) que resuelva timers y alertas en Quick antes de gastar un run. Sin medir, no se construye el router.
2. **Contexto.** Si el run por webhook no ve la conversación 1:1 del Bot, el relé debe mandar las últimas N líneas del historial local en el cuerpo del webhook, y «Clear history here» pasa a tener efecto real.
3. **Concurrencia.** Si Grok Bot pisa o descarta runs encolados, el envío se bloquea mientras hay uno pendiente («· Working» y nada más), como hace AI Chat hoy.
4. **Obediencia.** Si el Bot a veces responde solo en su chat, la línea «No reply yet» aparece antes (5 min) y el lector de notificaciones deja de ser respaldo.
5. **Aprobaciones.** Si el Bot no puede llamar `glasses_needs_you` antes de bloquearse, la vía 2 de §4 es la única y hay que verificar qué texto trae la notificación.
6. **Seis tarjetas.** Si tres scrolls al anillo se sienten largos, el plan B es Bots en More con «Bots · 1 new» en la fila y despertar por respuesta como única señal; se pierde el vistazo.
