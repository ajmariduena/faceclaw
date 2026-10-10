# Lean UX: home, gestos, More, claves y recortes (Fable, 10 oct 2026)

Revisión de diseño sobre `research/lean.md`, el home v3, el marco terminal aprobado y el código actual (`app/ui/gestures.ts`, `app/ui/shell/shell.ts`, `app/apps/home/`, `app/apps/paseo/`, `app/apps/ai-chat/`). Renders en `tools/headless-render/lean-ux-fable.cjs` → `out/lean-home-paseo.png`, `out/lean-home-converse.png`, `out/lean-converse-live.png`, `out/lean-more-list.png`. No se tocó código de la app.

## 1. Home: cinco tarjetas

Orden fijo y circular: **Paseo → Calendar → Translate → Converse → More**. Cinco puntos, nunca se ocultan.

| Tarjeta | Qué muestra de un vistazo |
|---|---|
| Paseo | Las dos últimas novedades: agente y edad en tenue («Fix reconnect BLE · needs you»), oración de Luna en blanco. Si un agente te necesita, va primero. Sin daemon: «Mac unreachable» en tenue, no una tarjeta vacía |
| Calendar | Los dos eventos siguientes de hoy; mañana si hoy no queda nada. No repite el evento de la columna izquierda |
| Translate | «ES ⇄ EN» y debajo «Ready» en tenue. Sin «Tap to start»: es una instrucción de gesto y la regla las prohíbe (hoy la tarjeta v3 la lleva) |
| Converse | Icono, «Live facts · ES/EN», y en tenue el último resumen guardado («Last: Café con Lucía · 14:02») |
| More | Icono y «More»; sin texto de ayuda |

**Converse va como tarjeta, no en More.** Es la app que se abre con alguien ya hablando: desde More cuesta swipe + tap + scroll + tap con el anillo; desde el home, dos swipes y un tap. Y hay sitio: Music y Notifications liberaron dos ranuras. Translate y Converse quedan juntas porque comparten Soniox y el mismo gesto de arranque.

**Paseo es la tarjeta 1 y lo que muestra despertar.** La columna Horizonte ya trae hora, fecha y el próximo evento, así que despertar en Calendar repetía la izquierda. Despertar en Paseo responde a la pregunta por la que te pones las gafas («¿algún agente me necesita?»), y el ajuste «Wake when an agent needs you» ya despierta por esa razón: la tarjeta correcta ya está puesta y un tap abre el agente. «Hey Even» no pasa por el home: despierta y abre AI Chat escuchando.

Pendiente de la regla de inglés: las líneas de Horizonte («Sábado 10 oct», «en 49 min», «Ahora», «Todo el día») y los estados de `home-model.ts` siguen en español.

## 2. Un solo mapa de gestos (anillo primero)

El anillo manda tap, doble tap, scroll arriba/abajo, mantener y tap+mantener; no hay izquierda/derecha. El mismo mapa en todas las pantallas:

| Gesto | Significado único | Home | Listas (More, Paseo) | Chat (Paseo, AI Chat) | Elección (caja anidada) | Grabando (Translate, Converse) |
|---|---|---|---|---|---|---|
| Tap | Confirmar lo marcado | Abre la tarjeta | Abre la fila «>» | Empieza a dictar; otro tap envía | Elige la opción «>» | Pausa / reanuda la escucha (pie «· Paused») |
| Doble tap | Un nivel atrás | Apaga la pantalla (con guarda, abajo) | Vuelve al home, a la tarjeta de origen | Vuelve a la lista o al home | Cierra sin elegir | Pide «Stop and exit? > Keep / Exit»; doble tap = Keep |
| Scroll | Mover el «>» o el contenido | Tarjeta anterior / siguiente (abajo = siguiente) | Fila anterior / siguiente | Historial arriba / abajo | Opción anterior / siguiente | Marca un dato; el marcado muestra su fuente en tenue |
| Mantener | Menú del sistema (shell) | — | — | — | — | — |
| Tap + mantener | Menú de la app (raro) | — | Stop agent, Archive | New session, Full reply | — | Direction ES→EN / EN→ES / both, Save |
| «Hey Even» | AI Chat escuchando | Sí | Sí | Sí | Sí | Ignorado mientras se graba (ya es así) |
| Despertar | Home, tarjeta 1 | | | | | |

Regla de dirección: scroll-down siempre avanza (siguiente tarjeta, fila de abajo, opción de abajo, historial más nuevo). Hoy el home mapea scroll-up a `move(-1)`: coincide.

Dónde el mapeo actual rompe la gramática y qué cambiar:

- **El ciclo de tarjetas no depende de swipes laterales.** `home-app.ts` mueve con scroll-up/down, que es lo que manda el anillo; swipe-left/right solo existen para el reloj. No hay que arreglarlo, solo no reintroducirlo.
- **Doble tap en home apaga la pantalla** (`shell.ts` ~1038). Es la gramática stock y despertar también es doble tap, así que se queda, pero con guarda: ignorar el doble tap durante ~700 ms después de llegar al home. Hoy chat → lista → home → pantalla negra sale de tres dobles taps seguidos sin querer.
- **AI Chat usa mantener como pulsar-para-hablar** (`ai-chat-app.ts:102`) y su doble tap manda el foco al app switcher, no al home. Mantener es del sistema; el AI Chat lean usa tap para dictar y tap para enviar, igual que el chat de Paseo, y doble tap vuelve al home. Sin «Hold to speak» en pantalla.
- **Translate hoy abre Microphones** (`appId: "microphones"`), cuyo radar usa mantener y cuyo doble tap solo cierra una capa interna. Translate y Converse deben ser apps propias con el marco terminal y el mapa de arriba.
- **El app switcher / sidebar** tiene su propia semántica de doble tap (apaga) y el menú del sistema ofrece «Focus app switcher». Con el home como raíz, ese foco no debe ser alcanzable: se oculta el switcher y se quita esa entrada del menú.
- **Scroll durante el dictado** se descarta en Paseo: correcto, mantenerlo igual en AI Chat.

## 3. More

Lista fija de cuatro filas: **AI Chat, Timers, Navigate, Settings** (render `lean-more-list.png`). Pie «· More  1/4».

- **AI Chat:** se queda en More y por «Hey Even»; no merece tarjeta porque no muestra nada de un vistazo.
- **Timers: se queda, pero se crean por voz.** El asistente ya tiene herramientas `timer.*` (`app/assistant/timer-tools.ts`); la fila sirve para ver y cancelar. Un timer activo se muestra en la columna Horizonte bajo el evento.
- **Teleprompter: fuera.** Necesita guiones en el Android, que solo corre Faceclaw; nadie los va a cargar ahí. Se oculta, no se borra.
- **Settings: se queda, reducido a estado.** Cinco filas: Glasses battery, Ring battery, Paseo (connected / unreachable), Soniox / LLM / Search (ok / missing / invalid, con la última prueba del teléfono), Brightness, Disconnect. Todo lo demás vive en el teléfono.
- **Navigate:** fila presente desde ya para no mover la lista cuando llegue; abrirla sin token muestra «Mapbox token missing» en tenue.

## 4. Teléfono: pantalla «API keys» por función

Las claves se quedan en el teléfono (el «cerebro» de Converse corre ahí, no depende de la Mac despierta). Cada fila: nombre, valor enmascarado, botón **Test** y una línea de estado con hora: «OK · 320 ms · 09:41», «Invalid key (401)», «No credit (402)», «Not set». Arriba, **Test all**. El mismo estado se lee en las gafas en Settings.

| Grupo | Clave | Para qué | Cómo se prueba |
|---|---|---|---|
| Paseo | Pairing link (ya existe) | Lista, chat, dictado (la clave de ElevenLabs se queda en la Mac) | Conectar por relay y contar agentes: «Connected · 46 agents» |
| Listening (Translate, Converse) | Soniox | Transcripción y traducción en vivo | Abrir una sesión `stt-rt-v5` de un segundo y cerrarla; el handshake falla con clave mala |
| Facts (Converse, AI Chat) | OpenRouter | Jev (`typesafe/jev-1.13`) para decidir, `gpt-oss-120b` en Cerebras para redactar y responder en AI Chat | `GET /api/v1/auth/key`: devuelve límites y uso |
| Facts (Converse) | Parallel | Búsqueda web (`fast`, acepta español) | Una consulta fija y medir latencia |
| Navigate (later) | Mapbox | Rutas | Geocodificar una dirección fija |
| Advanced (plegado) | Cerebras directo, Anthropic, OpenAI, Brave | Solo si la latencia por OpenRouter no alcanza, o para cambiar de buscador | Igual que arriba |

**Una clave menos:** el probe del 9 oct ya corrió Cerebras a través de OpenRouter (~285 ms). No hace falta una clave de Cerebras aparte hasta medir que el camino directo es más rápido. Se quitan de la vista principal ElevenLabs (dictado vía daemon) y OpenAI (Soniox es el proveedor de transcripción). Brave queda en Advanced: el plan Free da 429 y el de pago solo ahorra ~0,4 s.

## 5. Qué quitar o simplificar

- **Launcher grid y carpetas:** la lista More lo sustituye. `ALL_APPS` registra 28 apps; en lean quedan Home, Paseo, Calendar, Translate, Converse, AI Chat, Timers, Navigate, Settings y Launcher solo detrás de Developer. Se ocultan Music, Notifications, Calculator, Terminal, T3 Code, Files, Nightscout, Transcribe, Weather, Compass, Roam, los juegos, EvenHub, Glanceboard, Teleprompter, Microphones.
- **Ajustes del teléfono:** Customization entera (posición del switcher, profundidad, barra de estado, borde, fuente, animación) se fija por diseño. Voice: Wakeword fijo en AI Chat, proveedor fijo Soniox, sin modelos ASR locales. Assistant: backend fijo «on-phone», modelo fijo rápido, sin bridge host/port/token/proactive. Watch detrás de Developer. Quedan Display (brillo, timeout), Phone display, API keys, Developer mínimo, About, Quit.
- **Shell:** switcher y barra de estado ocultos (Horizonte da la hora); menú del sistema reducido a Home, Screen off, Disconnect; sin «Focus app switcher» ni «Voice input» (el tap del chat lo cubre). Avisos emergentes de notificaciones apagados y sin pedir el permiso de notificaciones.
- **Textos en pantalla:** quitar todo «Toca para…» / «Hold to speak» / «Listening...» explicativo; el pie de estado («· Listening 0:03») es la única señal.

Riesgos de uso más serios, en orden:

1. **Pantalla negra por doble tap de más** al salir de un chat. Guarda de 700 ms en el home.
2. **Pausar sin querer** Translate/Converse con un tap suelto del anillo. El pie «· Paused» en blanco (no tenue) y un tap lo reanuda; nunca se pierde la sesión.
3. **Soniox corriendo olvidado** (~US$0,18/h). Auto-stop tras 3 min sin voz, con el pie contando los últimos 30 s.
4. **Mac dormida o sin relay:** la tarjeta Paseo debe decir «Mac unreachable», no «No updates», y la lista reintenta sola.
5. **Clave mala descubierta en las gafas.** La tarjeta muestra «Soniox key missing» en tenue y la prueba está en el teléfono; sin esto el fallo es una pantalla vacía.
6. **Datos de Converse equivocados.** Fuente siempre visible al marcar el dato; nunca más de tres en pantalla; el dato nuevo es el único en blanco.
7. **Dirección del scroll.** Si abajo no avanza en todas partes, el anillo se vuelve adivinanza; es una prueba explícita de la primera build.
