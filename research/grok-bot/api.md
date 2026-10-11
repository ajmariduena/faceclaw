# Grok Bot: qué API existe de verdad (10 oct 2026, revisado)

Fuentes: docs.x.ai/grok-bot, cursor.com/docs y cursor.com/help de Grok Bot, el paquete npm `@cursor/bdk` 0.2.23 (publicado por Cursor), el foro de Cursor, r/EvenRealities y GitHub. Copias locales en `/tmp/grokbot-docs/` y `/tmp/bdk-pkg.k9vX/` (no versionadas).

## Conclusión

**Sí se puede hablar con un Grok Bot por API, directo desde el teléfono.** La primera versión de este documento decía que no: es falso. La API no está en los docs públicos de Cursor ni en `docs.x.ai/openapi.json`, pero Cursor la usa en su propio SDK:

- `@cursor/bdk` (Anysphere, licencia Cursor SDK, publicado el 22 sep 2026) trae la extensión oficial `cursor-grokbot-agents` y la guía `docs/guides/grokbot-agents.md`: «consult the Grok Bot agents on its serve host's Cursor account. The bot keeps its existing conversation, memory, and tools».
- Su cliente (`dist/extensions/cursor-grokbot-agents/lib/backend.js`) llama cuatro rutas REST en `api.cursor.com`, con la API key de usuario de Cursor.
- Prueba en vivo sin credenciales: `GET /v0/grokbot/sessions/x/entries` responde `401 Invalid User API Key`; una ruta inventada responde `404`. La ruta existe en producción.
- `SergioAppen/grokbot-g2` (r/EvenRealities, 6 oct) ya usa esta vía para llevar Grok Bot a unas G2, con varios Bots y lista de conversaciones.

## La API (`/v0/grokbot`)

Base `https://api.cursor.com`. Header `Authorization: Bearer <CURSOR_API_KEY>`. La key se crea en cursor.com/dashboard/api.

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /v0/grokbot/sessions` | `{name}` | `{id, name, createdAtMs, latestUpdatedSeq}`. Busca el Bot por nombre **y lo crea si no existe** |
| `POST /v0/grokbot/sessions/{id}/messages` | `{text, messageId}` (UUID, idempotente) | `{messageId, delivery}`. `accepted_temporal` o `duplicate` = aceptado |
| `GET /v0/grokbot/sessions/{id}/entries?afterUpdatedSeq=…` | — | `{entries:[{seq, updatedSeq, kind, role, text, createdAtMs}], latestUpdatedSeq, turn:{idle, inFlight, queued}}` |
| `POST /v0/grokbot/sessions/{id}/interrupt` | `{reason}` | Corta el turno. La conversación y la memoria del Bot siguen |

Cómo se usa, según el cliente oficial:

- **Respuestas**: son las entradas con `kind: "send-message"`. Un turno puede traer varias (acuse, avance, respuesta final), y cada una se muestra al llegar.
- **Fin del turno**: página vacía con `turn.idle` y sin `inFlight` ni `queued`. Si nunca se vio el turno ocupado, el SDK pide 4 lecturas en reposo seguidas antes de darlo por terminado.
- **Espera**: el SDK espera 120 s por defecto (máximo 600) y después devuelve `running`; luego `check` sigue leyendo desde el cursor. Es la misma conversación que se ve en la app de Grok Bot.
- **Bot ocupado**: si el Bot está trabajando en otra cosa, el SDK no envía y avisa. La API sí acepta el mensaje (`queued` sube), pero el SDK evita encolar a ciegas.

## Lo que la API no da

- **Lista de Bots**: no hay `GET /v0/grokbot/sessions` (da `404`). Los Bots se nombran a mano, y un nombre mal escrito **crea un Bot vacío**. Faceclaw debe guardar los nombres exactos y avisar si una sesión vuelve recién creada (`createdAtMs` reciente).
- **Streaming**: no lo hay; se hace polling de `entries`.
- **Aprobaciones, secretos y tarjetas**: se ven como entradas de otro `kind`, pero no hay ruta para responderlas. Se contestan en la app de Grok Bot.
- **Contrato público**: es `v0` y no aparece en los docs públicos de la API de Cursor. Puede cambiar sin aviso, aunque el SDK oficial depende de ella.

## Otras vías que usa la comunidad (descartadas para Faceclaw)

| Vía | Ida y vuelta | Por qué no |
|---|---|---|
| Webhook de un routine + MCP o callback de vuelta | Sí, armándolo | Necesita relé público y MCP. La API de arriba lo hace sin infraestructura |
| Gateway interno de la computadora del Bot (`127.0.0.1:1340`, token en `/home/box/sand-data/gateway.json`; `grokbot-sdk`, puentes de Telegram y Discord) | Sí, completo (incluso aprobaciones) | No oficial. Exige Tailscale o un proceso dentro de la computadora del Bot, que un Update/Reset puede borrar |
| Sesión del desktop contra `api2.cursor.sh` (`grok-bot-cli`, 96★) | Sí | Lee la sesión cifrada de la app. Solo sirve en una computadora con el desktop instalado |
| Team Bot en Slack, email del Bot, automatizar la UI | Parcial | Plan Teams, lento, o frágil |

El gateway interno vale como plan B si hace falta responder aprobaciones desde las gafas.

## Qué cambia en Faceclaw

No hace falta relé: el teléfono habla con `api.cursor.com` como hoy habla con OpenRouter (`app/native/openrouter.ts`).

1. **Backend nuevo `grokbot`** junto a `direct` y `external` (`session.ts:28-30`). Enviar = `sessions` (una vez por Bot, con cache del `id`) + `messages`. Recibir = polling de `entries` desde el cursor. Cada `send-message` va al chat como un `text-delta` completo.
2. **Turnos largos**: el tope de 2 min de `direct-backend.ts` y el de 3 min del puente no aplican. Al vencer la espera en pantalla, el turno queda «Working»: el polling sigue en segundo plano, con intervalo más largo, hasta `idle`.
3. **Backend por conversación**: cada conversación de `conversations.ts` guarda `{backend:"grokbot", botName, sessionId, cursor}`. Cambiar de Bot = cambiar de conversación.
4. **Ajustes**: la key de Cursor (`llm.cursorApiKey`) junto a las demás en `app/phone-ui/api-keys-page.ts`, y una lista editable de nombres de Bots con uno por defecto. La key da acceso a toda la cuenta de Cursor y hoy los ajustes se guardan en texto plano (`FaceclawSettings.kt:25-42`). Conviene moverla a almacenamiento cifrado.
5. **Herramientas de las gafas**: con esta API el Bot no puede llamar a timers, alertas ni navegación del teléfono. Si se necesita, se agrega aparte con un MCP propio (lo que diseñaba la versión anterior de este documento). Para lo local queda el modelo del teléfono como Bot «Quick».
6. **Mensajes que el Bot manda solo** (routines, trabajo en segundo plano) aparecen en `entries`. Un polling de fondo de baja frecuencia los muestra en la lista y despierta las gafas, como hace Paseo.

## Mediciones reales (10 oct 2026, bot «Glasses» creado por la API)

| Prueba | Resultado |
|---|---|
| `POST sessions {name:"Glasses", instructions}` | `200`, bot creado (`createdAtMs` = ahora). **`instructions` se ignora**: el bot no conoce la configuración. La descripción se pega en la app |
| Primera pregunta, bot recién creado | Respuesta a los **15.7 s** (arranque en frío) |
| Pregunta siguiente, bot despierto | **3.6 s**. Recuerda el contexto |
| Tarea con web (clima de mañana) | Acuse «Ya reviso el pronóstico…» a los **2.9 s**, resultado a los **14.3 s** (174 caracteres, sin la instrucción corta) |
| Mensaje mientras trabaja | `accepted_temporal` con el **mismo `workflowId`**: se integra al turno en curso, no se encola (`queued` sigue en 0) |
| `interrupt` | `{interrupted:true}`, el turno pasa a `idle` y no llega resultado. El último mensaje del bot antes del corte puede decir «ya estoy en eso»: la UI debe mostrar «Stopped» |
| Nombres de `kind` vistos | `message` (usuario) y `send-message` (bot). Aprobaciones: sin probar |

Consecuencias para el diseño: «Bot ocupado» no hace falta, porque enviar mientras trabaja corrige el turno en curso. El acuse llega en unos 3 s, así que el estado «Working» casi siempre muestra ya una línea del bot.

## Medir antes de construir (prueba de 15 min con `curl` y una key)

1. Latencia hasta la primera `send-message` en una pregunta simple.
2. Qué `kind` tienen las aprobaciones y los pedidos de login, para mostrar «Needs you in Grok Bot app».
3. Costo de un polling cada 2 s y límites de tasa de `api.cursor.com` (el Admin API documenta 120/min por endpoint en otras rutas).
4. Si `POST sessions` con el nombre exacto encuentra el Bot que ya existe, con su memoria.
