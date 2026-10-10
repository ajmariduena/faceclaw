# Lean build: especificación única (10 oct 2026)

Fuente de verdad para la corrida de implementación. Junta `lean.md`, `lean-ux-fable.md`, `lean-ux-astra.md` y las decisiones de Alexander. Cuando algo choque, manda este archivo.

## Reglas globales
- Marco terminal de Even en todas las pantallas: una caja redondeada de 1 px, fuente stock con paso de 27 px, contenido en blanco, lo secundario en tenue, elecciones en una caja anidada con «>», una línea fina y un pie de estado («· Working  1m»). Renders de referencia en `tools/headless-render/` (paseo-simple.cjs, paseo-chat-fable.cjs, paseo-questions.cjs, calendar-terminal.cjs, aichat-terminal.cjs, lean-ux-fable.cjs, lean-ux-astra.cjs).
- **Toda la interfaz en inglés**, incluidas las tarjetas del home y las líneas de Horizonte (fecha, «in 25 min», «Now», «All day»). El contenido (títulos de eventos, mensajes, resúmenes) queda en su idioma.
- Sin instrucciones de gestos en pantalla («Tap to…», «Hold to speak», etc.).
- El teléfono principal es un iPhone; el Android solo corre Faceclaw. Las G2 no tienen parlante.

## Gestos (anillo R1 primero; patillas iguales; sin swipes laterales)
| Gesto | Significado en todas partes |
|---|---|
| Tap | Confirmar lo marcado con «>» o la acción principal de la pantalla |
| Scroll arriba/abajo | Mover el «>» o el historial; abajo siempre avanza. El home es circular; listas y opciones se detienen en los extremos |
| Doble tap | Volver un nivel (detalle → lista → home, a la tarjeta de origen). En el home apaga la pantalla, pero se ignora durante ~700 ms después de llegar al home |
| Mantener | Menú del sistema, reducido a: Home, Screen off, Disconnect |
| Tap + mantener | Menú de la app (Stop/Archive en Paseo, New session en AI Chat, etc.) |
| «Hey Even» | Abre AI Chat escuchando, salvo durante una grabación de Translate/Converse |

Arreglos obligatorios: el shell intercepta el doble tap (`shell.ts` ~1038) y manda cualquier app al home; la app debe recibirlo primero y solo su raíz vuelve al home. Quitar «Focus app switcher» y «Voice input» del menú del sistema; ocultar el selector de apps y la barra de estado.

## Home
- Cinco tarjetas fijas y circulares: **Paseo → Calendar → Translate → Converse → More**. Cinco puntos.
- **Al despertar** (cuando la pantalla de las gafas se enciende) se muestra la tarjeta Paseo.
- Paseo: las dos últimas novedades (agente y edad en tenue, línea en blanco); primero las que necesitan algo; «Mac unreachable» en tenue si no hay conexión.
- Calendar: los eventos que vienen después del que ya muestra Horizonte; mañana si hoy no queda nada.
- Translate: «ES ⇄ EN» y «Ready» o «Setup required» en tenue.
- Converse: «Live facts · ES/EN» y «Coming soon» en tenue (la app todavía no se construye; al abrirla, una pantalla de marco con «Not built yet»).
- More: ícono y «More».
- Fuera: las tarjetas de Music y Notifications, los avisos emergentes de notificaciones y el pedido de ese permiso.

## More
Lista fija, marco terminal, pie «· More  1/4»: **AI Chat, Timers, Navigate, Settings**. La cuadrícula del launcher solo queda detrás de Developer. Se ocultan (sin borrar código) las demás apps: Music, Notifications, Calculator, Terminal, T3 Code, Files, Nightscout, Transcribe, Weather, Compass, Roam, juegos, EvenHub, Glanceboard, Teleprompter, Microphones.

## Apps
- **Paseo:** ya existe. Cambio: el dictado termina en un borrador «> Send / Edit / Discard» antes de enviar; doble tap durante el dictado lo cancela sin enviar.
- **AI Chat:** mismo chat que Paseo (`ruleslatest`: tú a la derecha, la respuesta a la izquierda, una línea sobre lo más nuevo). Tap dicta (con el mismo borrador Send/Edit/Discard), sin pulsar para hablar. Modelo por defecto: `openai/gpt-oss-120b` en Cerebras a través de OpenRouter (proveedor nuevo compatible con OpenAI) con respuestas de 1–2 líneas; las herramientas actuales (timers, etc.) se mantienen y sus acciones se ven como una línea tenue «> Timer · 10 min». Pie «· AI Chat  <modelo>» / «· Listening 0:03» / «· Thinking 1.4s».
- **Calendar:** agenda en marco terminal: encabezados de día en tenue, columna de hora, «>» en el elegido, lo pasado más tenue, días siguientes al hacer scroll, «Nothing scheduled» en días vacíos y detalle del evento (hora, lugar, notas). Sin acciones nuevas que no existan.
- **Translate:** app propia (deja de abrir Microphones). Soniox en streaming con traducción bidireccional ES⇄EN. Arranca al abrir si hay clave; sin clave muestra «Soniox key missing». Lo traducido en blanco y el original en tenue; pie «· Translating  ES ⇄ EN  0:42». Tap pausa o reanuda («· Paused» en blanco). Salir mientras graba pide «Stop and leave?» con «> Keep listening / Stop and leave». Se detiene solo tras 3 min sin voz. No se puede validar sin clave ni gafas: dejarlo listo y con tests de la capa de datos.
- **Timers:** lista en marco terminal; ver y cancelar. Se crean por voz desde AI Chat.
- **Navigate:** se deja como está (para después), con el texto ya en inglés; sin token muestra «Mapbox token missing».
- **Settings (gafas):** solo estado: batería de las gafas y del anillo, Paseo (connected / unreachable), claves (ok / missing / failed según la última prueba del teléfono), brillo, Disconnect.
- **Converse:** no se construye en esta corrida (solo la tarjeta y el placeholder). Especificación en `research/conversar/plan.md`.

## App del teléfono
- Pantalla **API keys** agrupada por función. Cada fila: valor enmascarado, botón **Test** y estado con hora («OK · 320 ms · 09:41», «Invalid key (401)», «No credit (402)», «Not set»); arriba, «Test all».
  - Paseo: link de pairing (ya existe) con «Test connection» (relay y número de agentes).
  - Listening (Translate, Converse): Soniox. Test: abrir y cerrar una sesión `stt-rt-v5`.
  - Facts y AI Chat: OpenRouter (Jev y Cerebras). Test: `GET https://openrouter.ai/api/v1/auth/key`.
  - Search (Converse): Parallel. Test: una consulta fija en modo `fast`.
  - Advanced (plegado): Cerebras directo, Anthropic, OpenAI, Brave, Mapbox, ElevenLabs.
- Ocultar del teléfono (detrás de Developer o fijo por diseño): Customization entera, proveedores y modelos de Voice, backend y bridge del asistente, Watch.
- No borrar datos ni claves existentes al simplificar.
